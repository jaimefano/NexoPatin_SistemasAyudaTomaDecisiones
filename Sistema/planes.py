# -*- coding: utf-8 -*-
"""
Generador de PLANES COMPLETOS de la noche (paso 1 "Opciones" de la interfaz). Ver Documentacion/Diseno_Interfaz_SATD.md, apartado 6.1.

Un plan es una ruta completa {camion: [tareas]} (el mismo tipo que usa simulador.py). Aqui se genera un conjunto grande
de planes por muestreo aleatorio con semilla fija y se aplica el PRIMER FILTRO SIMPLE, y solo ese:
    1) factible fisicamente (simulador.evaluar_ruta sin problemas)
    2) sin duplicados (forma canonica: dos planes que solo cambian de camion cuentan como uno)
    3) dentro de los limites del jefe (los que haya fijado)
No se usa dominancia/Pareto ni puntuaciones: el sistema no recomienda, no ordena por calidad y no quita "los peores".
El identificador ("Plan 017") sale de un hash de la forma canonica, no del orden ni de la calidad.

No modifica simulador.py ni sugerencias.py; los usa. Se usa importandolo (import planes) o desde backend/main.py.
"""
import hashlib
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simulador as sim          # noqa: E402
import sugerencias as sug        # noqa: E402

# ------------------------- Constantes configurables -------------------------
SEMILLA = 20261112               # semilla fija: mismo estado de flota -> mismos planes
N_MUESTRAS = 4000                # subconjuntos de tareas que se muestrean (se descartan infactibles y duplicados)
OBJETIVO_PLANES = 800            # tope de planes factibles que se guardan (si se alcanza, se deja de muestrear)
TAREAS_MIN, TAREAS_MAX = 1, 6    # tamano del plan (numero de tareas)
UMBRAL_DOS_CAMBIOS = 20          # si una zona tiene mas bajos que esto, se ofrece una segunda tarea de cambio


# ------------------------- Utilidades -------------------------
def kpis_planos(k):
    """Valores esperados (3 dias) y del dia 1 de un resultado de calcular_kpis, en tipos de JSON."""
    r = sug.resumen_kpis(k)
    r["bajos_sin_cambiar"] = float(k["estado_final"]["bajos_sin_cambiar"].sum())
    r["demanda_dia1"] = float(k["dia1"]["esperado"]["demanda_atendida"])
    r["perdidos_zona"] = [float(v) for v in k["horizonte"]["esperado"]["perdidos_zona"]]
    return r


def efecto(base, r):
    """Diferencia de cada indicador frente a 'base' (normalmente no hacer nada)."""
    d = {c: r[c] - base[c] for c in r if c != "perdidos_zona"}
    d["bajos_sin_cambiar"] = r["bajos_sin_cambiar"] - base["bajos_sin_cambiar"]
    return d


def forma_canonica(ruta):
    """Tupla ordenada de las listas de tareas de los camiones que trabajan (el numero de camion no cuenta)."""
    return tuple(sorted(tuple(tuple(t) for t in ts) for ts in ruta.values() if ts))


def ruta_de_canon(canon):
    """Ruta {1..4: [tareas]} con los camiones ya renumerados segun la forma canonica."""
    return {i + 1: [tuple(t) for t in ts] for i, ts in enumerate(canon)}


def resumen_tarea(t):
    if t[0] == "CAMBIO":
        return "Cambio %s" % t[1]
    return "Reubicar %s→%s" % (t[1], t[2])


def clave_estado(estado, tipo_dia):
    """Clave de cache: estado de la flota + tipo de dia."""
    return (tipo_dia, tuple(estado.cargados), tuple(estado.bajos), float(estado.stock_taller))


# ------------------------- Catalogo de tareas -------------------------
def catalogo(datos, estado):
    """Tareas con cantidades por defecto (como sugerencias.candidatas) sobre la ruta vacia."""
    vacia = {}
    tareas = []
    for i, z in enumerate(sim.ZONAS):
        pend = int(estado.bajos[i])
        for _ in range(2 if pend > UMBRAL_DOS_CAMBIOS else 1):
            rec = int(min(sim.CAPACIDAD, pend))
            if rec <= 0:
                break
            rep = int(min(rec, estado.stock_taller))
            tareas.append(sim.cambio(z, rep, rec))
            pend -= rec
    for o in sim.ZONAS:
        for w in sim.ZONAS:
            if o == w:
                continue
            for mov in range(sim.CAPACIDAD, 0, -1):
                t = sim.reubicar(o, w, mov)
                if not sim.evaluar_ruta(datos, estado, sug.anadir(vacia, 1, t))["problemas"]:
                    tareas.append(t)
                    break
    return tareas


def repartir(datos, tareas):
    """Reparto determinista: de mayor a menor duracion, cada tarea al camion con menos minutos acumulados."""
    dur = {t: sim.calcular_camion(datos, [t])[0] for t in tareas}
    camiones = {c: [] for c in range(1, sim.N_CAMIONES + 1)}
    carga = {c: 0.0 for c in camiones}
    for t in sorted(tareas, key=lambda t: (-dur[t], t)):
        c = min(carga, key=lambda c: (carga[c], c))
        camiones[c].append(t)
        carga[c] += dur[t]
    return {c: ts for c, ts in camiones.items() if ts}


# ------------------------- Generacion -------------------------
def generar(datos, estado, progreso=None):
    """Genera los planes factibles y sin duplicados (sin aplicar los limites del jefe: eso se hace en filtrar()).

    Devuelve {"nada": kpis, "n_generados": int, "planes": [dict]} con los planes ordenados por id (orden neutro).
    progreso: funcion opcional f(fraccion 0..1).
    """
    rng = random.Random(SEMILLA)
    cat = catalogo(datos, estado)
    nada_k = sim.calcular_kpis(datos, estado, {})
    nada = kpis_planos(nada_k)
    vistos, candidatos = set(), []
    for n in range(N_MUESTRAS if cat else 0):      # sin tareas posibles (todo a 0) no hay planes que muestrear
        if len(candidatos) >= OBJETIVO_PLANES:
            break
        if progreso and n % 100 == 0:
            progreso(min(0.9, 0.9 * max(n / N_MUESTRAS, len(candidatos) / OBJETIVO_PLANES)))
        tam = rng.randint(TAREAS_MIN, min(TAREAS_MAX, len(cat)))
        ruta = repartir(datos, rng.sample(cat, tam))
        canon = forma_canonica(ruta)
        if canon in vistos:
            continue
        vistos.add(canon)
        if sim.evaluar_ruta(datos, estado, ruta)["problemas"]:
            continue
        candidatos.append(canon)

    # Identificador neutro: 3 digitos del hash de la forma canonica (4 si hay muchos planes); si dos coinciden, el siguiente libre
    digitos = 3 if len(candidatos) <= 900 else 4
    modulo = 10 ** digitos
    ids, planes = set(), []
    for i, canon in enumerate(sorted(candidatos, key=lambda c: hashlib.md5(repr(c).encode()).hexdigest())):
        n = int(hashlib.md5(repr(canon).encode()).hexdigest(), 16) % modulo
        while n in ids:
            n = (n + 1) % modulo
        ids.add(n)
        ruta = ruta_de_canon(canon)
        k = sim.calcular_kpis(datos, estado, ruta)
        kp = kpis_planos(k)
        tareas = [t for c in sorted(ruta) for t in ruta[c]]
        planes.append({
            "id": str(n).zfill(digitos), "ruta": ruta, "tareas": [resumen_tarea(t) for t in tareas],
            "n_tareas": len(tareas), "minutos": float(sum(k["evaluacion"]["tiempos"].values())),
            "camiones_usados": len(ruta), "kpis": kp, "delta": efecto(nada, kp),
            "_k": {"reserva": kp["reserva"], "demanda": kp["demanda_atendida"], "coste": kp["coste"]},
        })
        if progreso and i % 50 == 0:
            progreso(0.9 + 0.1 * i / max(1, len(candidatos)))
    planes.sort(key=lambda p: p["id"])
    return {"nada": nada, "n_generados": len(vistos), "planes": planes}


def filtrar(conjunto, limites):
    """Primer filtro simple (3): los planes que cumplen los limites del jefe. Sin limites -> todos."""
    if limites is None or (limites.reserva_min is None and limites.demanda_min is None and limites.coste_max is None):
        return conjunto["planes"]
    out = []
    for p in conjunto["planes"]:
        k = p["_k"]
        if limites.reserva_min is not None and k["reserva"] < limites.reserva_min:
            continue
        if limites.demanda_min is not None and k["demanda"] < limites.demanda_min - 1e-9:
            continue
        if limites.coste_max is not None and k["coste"] > limites.coste_max + 1e-9:
            continue
        out.append(p)
    return out

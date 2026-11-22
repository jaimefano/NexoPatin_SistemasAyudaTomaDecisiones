# -*- coding: utf-8 -*-
"""
Motor de sugerencias de la decision A. Ver Documentacion/Optimizador_y_Simulacion.txt, apartado 6.

Dada la ruta que el jefe lleva construida, genera las tareas que podria anadir AHORA cualquier camion, simula cada
una (horizonte rodante de 3 dias, con simulador.py) y calcula como cambiarian los KPI. Devuelve una lista corta:
por cada criterio, la tarea que MAS lo mejora. No hay puntuacion total ni sugerencia "recomendada": decide el jefe.

Criterios (valores ESPERADOS en el horizonte de 3 dias):
  - beneficio : la que mas aumenta el beneficio
  - perdidos  : la que mas reduce los viajes perdidos
  - bajos     : la que mas bajos retira (empate: la de mas beneficio)

Se usa importandolo: import sugerencias (o desde Sistema/). No incluye codigo de prueba.
"""
import os
import sys
import numpy as np

# El simulador esta en la misma carpeta (Sistema/)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simulador as sim

ZONAS = sim.ZONAS
CRITERIOS = {"beneficio": "mas beneficio", "perdidos": "menos viajes perdidos", "bajos": "mas bajos retirados"}


# ------------------------- Limites del jefe -------------------------
class Limites:
    """Limites opcionales que fija el jefe (None = sin limite). Se comprueban sobre los valores ESPERADOS del
    horizonte. No bloquean las tareas propias del jefe: avisan. Las sugerencias que los incumplirian no se proponen."""

    def __init__(self, reserva_min=None, demanda_min=None, coste_max=None):
        self.reserva_min = reserva_min        # patinetes cargados que deben quedar en el taller
        self.demanda_min = demanda_min        # demanda atendida minima (fraccion, p. ej. 0.95)
        self.coste_max = coste_max            # USD de camiones como maximo

    def incumplidos(self, k):
        """Lista de textos con los limites que incumple un resultado de calcular_kpis (vacia si cumple todos)."""
        avisos = []
        res = k["estado_final"]["reserva_taller"]
        dem = k["horizonte"]["esperado"]["demanda_atendida"]
        coste = k["horizonte"]["esperado"]["coste"]
        if self.reserva_min is not None and res < self.reserva_min:
            avisos.append("reserva del taller %d < %d" % (res, self.reserva_min))
        if self.demanda_min is not None and dem < self.demanda_min - 1e-9:
            avisos.append("demanda atendida %.1f %% < %.1f %%" % (100 * dem, 100 * self.demanda_min))
        if self.coste_max is not None and coste > self.coste_max + 1e-9:
            avisos.append("coste de camiones %.0f USD > %.0f USD" % (coste, self.coste_max))
        return avisos


# ------------------------- Utilidades de rutas -------------------------
def anadir(ruta, camion, tarea):
    """Copia de la ruta con la tarea anadida al final de la lista del camion (no modifica la original)."""
    nueva = {c: list(t) for c, t in ruta.items()}
    nueva.setdefault(camion, []).append(tarea)
    return nueva


def pendientes(estado, ruta):
    """Bajos que quedan por recoger en cada zona y stock que queda en el taller con la ruta actual."""
    rec = np.zeros(5)
    rep = 0
    for tareas in ruta.values():
        for t in tareas:
            if t[0] == "CAMBIO":
                rep += t[2]
                rec[ZONAS.index(t[1])] += t[3]
    return estado.bajos - rec, estado.stock_taller - rep


def resumen_kpis(k):
    """Los valores que se comparan (esperados, horizonte de 3 dias) y los del dia 1."""
    h, d1 = k["horizonte"]["esperado"], k["dia1"]["esperado"]
    return {"beneficio": float(h["beneficio"]), "perdidos": float(h["perdidos_zona"].sum()),
            "demanda_atendida": float(h["demanda_atendida"]), "coste": float(h["coste"]),
            "bajos": float((k["evaluacion"]["rec_por_zona"]).sum()),
            "reserva": float(k["estado_final"]["reserva_taller"]),
            "beneficio_dia1": float(d1["beneficio"]), "perdidos_dia1": float(d1["perdidos_zona"].sum())}


# ------------------------- Tareas candidatas -------------------------
def candidatas(datos, estado, ruta, limites=None):
    """Tareas que se podrian anadir ahora, con sus cantidades por defecto (el jefe las puede cambiar despues).

    - CAMBIO(z) en cada zona con bajos pendientes: rec = min(20, bajos pendientes); rep = rec, limitado por el stock
      que queda en el taller y, si el jefe fijo una reserva minima, por lo que se puede usar sin bajar de ella
      (si no queda stock utilizable, solo recoge).
    - REUBICAR(z, w) para cada par de zonas: mov = lo maximo (hasta 20) que se puede sacar de z sin que ninguna
      zona se quede por debajo de 0 cargados en ningun momento (linea de tiempo de simulador.py).
    Para cada camion (1..4). Los camiones que aun no tienen tareas son identicos, asi que solo se usa el primero
    de ellos (si no, la misma sugerencia saldria repetida). Solo se devuelven las que cumplen las reglas fisicas
    (360 min, capacidad, stock...). Devuelve una lista de (camion, tarea).
    """
    bajos_pend, stock_pend = pendientes(estado, ruta)
    if limites is not None and limites.reserva_min is not None:
        stock_pend = stock_pend - limites.reserva_min
    vacios = [c for c in range(1, sim.N_CAMIONES + 1) if not ruta.get(c)]
    camiones = [c for c in range(1, sim.N_CAMIONES + 1) if ruta.get(c)] + vacios[:1]
    lista = []
    for cam in sorted(camiones):
        for i, z in enumerate(ZONAS):
            rec = int(min(sim.CAPACIDAD, bajos_pend[i]))
            if rec <= 0:
                continue
            rep = int(min(rec, max(stock_pend, 0)))
            tarea = sim.cambio(z, rep, rec)
            if not sim.evaluar_ruta(datos, estado, anadir(ruta, cam, tarea))["problemas"]:
                lista.append((cam, tarea))
        for o in ZONAS:
            for w in ZONAS:
                if o == w:
                    continue
                for mov in range(sim.CAPACIDAD, 0, -1):          # la cantidad mas grande que sea valida
                    tarea = sim.reubicar(o, w, mov)
                    if not sim.evaluar_ruta(datos, estado, anadir(ruta, cam, tarea))["problemas"]:
                        lista.append((cam, tarea))
                        break
    return lista


def tiempo_libre(ev, camion):
    return sim.JORNADA_MIN - ev["tiempos"].get(camion, 0.0)


# ------------------------- Sugerencias -------------------------
def evaluar_candidatas(datos, estado, ruta, limites=None):
    """Simula la ruta actual + cada candidata y devuelve (base, lista de dicts con el efecto de cada una).

    Cada dict: camion, tarea, kpis (resumen_kpis), delta (cambio respecto a la ruta actual), tiempo_libre (del camion
    tras anadirla), avisos (limites que incumpliria). Las que incumplen un limite se marcan pero no se quitan aqui.
    """
    limites = limites or Limites()
    base = resumen_kpis(sim.calcular_kpis(datos, estado, ruta))
    res = []
    for cam, tarea in candidatas(datos, estado, ruta, limites):
        nueva = anadir(ruta, cam, tarea)
        k = sim.calcular_kpis(datos, estado, nueva)
        r = resumen_kpis(k)
        res.append({"camion": cam, "tarea": tarea, "kpis": r,
                    "delta": {c: r[c] - base[c] for c in r},
                    "tiempo_libre": tiempo_libre(k["evaluacion"], cam),
                    "avisos": limites.incumplidos(k)})
    return base, res


OPCIONES = [("beneficio", "Opcion 1 - Mas beneficio en 3 dias"),
            ("perdidos", "Opcion 2 - Menos viajes perdidos en 3 dias"),
            ("bajos", "Opcion 3 - Mas bajos retirados")]
_REGLAS = {"beneficio": (lambda e: e["delta"]["beneficio"], lambda e: e["delta"]["beneficio"] > 1e-6),
           "perdidos": (lambda e: (-e["delta"]["perdidos"], e["delta"]["beneficio"]), lambda e: e["delta"]["perdidos"] < -1e-6),
           "bajos": (lambda e: (e["delta"]["bajos"], e["delta"]["beneficio"]), lambda e: e["delta"]["bajos"] > 1e-6)}


def _misma(a, b):
    """Misma tarea (aunque sea con otro camion): no se ofrecen dos opciones que solo cambien de camion."""
    return a["tarea"] == b["tarea"]


def lista_corta(evaluadas):
    """Las 3 opciones fijas (decision del 02/11), siempre en este orden:
         Opcion 1: la tarea que mas aumenta el beneficio en 3 dias
         Opcion 2: la que mas reduce los viajes perdidos en 3 dias (empate: mas beneficio)
         Opcion 3: la que mas bajos retira (empate: mas beneficio)
    Solo entran tareas que cumplen los limites del jefe y que de verdad mejoran ese criterio.
    Si la mejor tarea de un criterio ya salio en una opcion anterior, se muestra la siguiente mejor para ese
    criterio (marcada con 'repetida_de'), para que el jefe vea siempre tareas distintas. Si no hay ninguna que
    mejore el criterio, la opcion sale vacia (tarea None).
    Devuelve una lista de 3 dicts: la candidata evaluada + 'opcion' (titulo) + 'repetida_de' (titulo o None)."""
    validas = [e for e in evaluadas if not e["avisos"]]
    opciones = []
    for crit, titulo in OPCIONES:
        clave, mejora = _REGLAS[crit]
        cand = sorted([e for e in validas if mejora(e)], key=clave, reverse=True)
        if not cand:
            opciones.append({"opcion": titulo, "tarea": None, "repetida_de": None})
            continue
        repetida = next((o["opcion"] for o in opciones if o["tarea"] is not None and _misma(o, cand[0])), None)
        elegida = next((e for e in cand if not any(o["tarea"] is not None and _misma(o, e) for o in opciones)), None)
        if elegida is None:                                # todas las que mejoran ya estan en otra opcion
            opciones.append(dict(cand[0], opcion=titulo, repetida_de=repetida))
        else:
            opciones.append(dict(elegida, opcion=titulo, repetida_de=repetida if elegida is not cand[0] else None))
    return opciones


def ordenar_por(evaluadas, criterio):
    """Todas las candidatas ordenadas por el criterio que elija el jefe ('beneficio', 'perdidos' o 'bajos')."""
    if criterio == "beneficio":
        return sorted(evaluadas, key=lambda e: -e["delta"]["beneficio"])
    if criterio == "perdidos":
        return sorted(evaluadas, key=lambda e: (e["delta"]["perdidos"], -e["delta"]["beneficio"]))
    if criterio == "bajos":
        return sorted(evaluadas, key=lambda e: (-e["delta"]["bajos"], -e["delta"]["beneficio"]))
    raise ValueError("Criterio desconocido: %s" % criterio)


# ------------------------- Textos -------------------------
def texto_tarea(cam, tarea):
    if tarea[0] == "CAMBIO":
        return "Camion %d: cambio en %s (repone %d, recoge %d)" % (cam, tarea[1], tarea[2], tarea[3])
    return "Camion %d: reubicar %d de %s a %s" % (cam, tarea[3], tarea[1], tarea[2])


def texto_efecto(e):
    d = e["delta"]
    return ("beneficio 3 dias %+6.0f USD (dia 1 %+5.0f) | viajes perdidos %+6.1f | bajos retirados %+3.0f | "
            "coste %+4.0f USD | quedan %3.0f min al camion" % (d["beneficio"], d["beneficio_dia1"], d["perdidos"],
                                                               d["bajos"], d["coste"], e["tiempo_libre"]))


def texto_sugerencias(base, evaluadas, n_todas=0):
    l = ["Ruta actual (3 dias, esperado): beneficio %.0f USD | viajes perdidos %.1f | bajos retirados %.0f | "
         "coste %.0f USD | reserva taller %.0f" % (base["beneficio"], base["perdidos"], base["bajos"], base["coste"], base["reserva"]),
         "Tareas posibles: %d (%d incumplen algun limite)" % (len(evaluadas), sum(1 for e in evaluadas if e["avisos"])),
         "Sugerencias (el jefe elige una, anade otra tarea, deshace o termina):"]
    for e in lista_corta(evaluadas):
        l.append("  %s" % e["opcion"])
        if e["tarea"] is None:
            l.append("      (ninguna tarea posible mejora este criterio)")
            continue
        nota = ("  (la mejor es la misma tarea que la %s; se muestra la siguiente)" % e["repetida_de"].split(" - ")[0]
                if e["repetida_de"] else "")
        l.append("      %s%s" % (texto_tarea(e["camion"], e["tarea"]), nota))
        l.append("      " + texto_efecto(e))
    if n_todas:
        l.append("Primeras %d por beneficio (todas las candidatas):" % n_todas)
        for e in ordenar_por(evaluadas, "beneficio")[:n_todas]:
            l.append("  - %-48s %s%s" % (texto_tarea(e["camion"], e["tarea"]), texto_efecto(e),
                                          ("  AVISO: " + "; ".join(e["avisos"])) if e["avisos"] else ""))
    return "\n".join(l)

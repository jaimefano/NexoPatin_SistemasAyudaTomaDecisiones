# -*- coding: utf-8 -*-
"""
Simulador de la decision A (reparto nocturno + recarga). Ver Documentacion/Optimizador_y_Simulacion.txt.

Dado el estado de la flota (lo introduce el administrador) y una ruta de los camiones (la construye el jefe),
calcula los 5 KPI recorriendo el dia hora a hora en los 3 escenarios de demanda.
HORIZONTE RODANTE (02/11): la ruta de esta noche se evalua a 3 dias. Los dias 2 y 3 se simulan sin camiones y al
final de cada dia una parte de los cargados pasa a bajos. Los KPI se dan para el dia 1 y para los 3 dias.
No hay optimizador: este modulo solo mide lo que pasa con una ruta.

Se usa importandolo: import simulador (o desde Sistema/). No incluye codigo de prueba.
"""
import os
import numpy as np
import pandas as pd

# ------------------------- Parametros del modelo -------------------------
ZONAS = ["Centro", "Norte-Centro", "Norte", "Oeste", "Sur"]
TALLER = "Taller"
ESCENARIOS = ["flojo", "normal", "fuerte"]      # 1/3 de probabilidad cada uno
TIPOS_DIA = ["laborable", "fin_de_semana"]      # tipos de dia con datos (los 4 festivos no se modelan)
TIPO_DIA = "laborable"                          # tipo de dia por defecto (02/11: ya se puede elegir fin de semana)
HORAS = 24                                      # se simulan las 24 horas (0 a 23)
ESCALA = 0.10                                   # empresa = 10 % de Lyft Chicago
N_CAMIONES = 4
JORNADA_MIN = 360                               # minutos por camion y noche
CAPACIDAD = 20                                  # patinetes por tarea
MANIPULACION_MIN = 1                            # minutos por patinete cada vez que se carga o se descarga
COSTE_HORA_CAMION = 25.0                        # USD/h (camion + conductor)
HORIZONTE_DIAS = 3                              # horizonte rodante: dias que se simulan (noches 2 y 3 sin camiones)
AUTONOMIA_KM = 15.0                             # autonomia de un patinete cargado (supuesto propio, 02/11; antes 30)
UMBRAL_BAJO = 0.10                              # un patinete es "bajo" con menos del 10 % de autonomia
KM_POR_VIAJE = 1.96                             # distancia media de un viaje (datos limpios)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # carpeta Proyecto
RUTA_ESCENARIOS = os.path.join(RAIZ, "Datos", "Escenarios_Demanda", "escenarios_demanda.csv")
RUTA_OD_HORA = os.path.join(RAIZ, "Datos", "Analisis_Demanda", "od_proporciones_hora.csv")
RUTA_INGRESO = os.path.join(RAIZ, "Datos", "Entradas_Modelo", "ingreso_zona_hora.csv")
RUTA_TIEMPOS = os.path.join(RAIZ, "Datos", "Entradas_Modelo", "matriz_tiempos_min.csv")


# ------------------------- Carga de datos -------------------------
class Datos:
    """Entradas fijas del modelo, ya en arrays de numpy, para uno o varios tipos de dia (laborable / fin de semana).

    Datos()                     -> los 3 dias del horizonte son laborables (como antes)
    Datos("fin_de_semana")      -> los 3 dias del horizonte son de fin de semana
    Datos("fin_de_semana", ["fin_de_semana", "fin_de_semana", "laborable"])
                                -> noche del sabado: sabado, domingo y lunes (tipo de cada dia del horizonte)
    Si el horizonte tiene mas dias que la lista, se repite el ultimo tipo.

    demanda[tipo][esc] : array (5 zonas, 24 horas) con los viajes medios por dia del escenario, YA con la escala 0,10
    od[tipo][h]        : array (5, 5); od[tipo][h][i, j] = proporcion de los viajes que salen de i a la hora h y llegan a j
    ingreso[tipo]      : array (5, 24) con el ingreso medio por viaje (USD) de cada zona y hora
    tiempos            : DataFrame 6x6 (5 zonas + taller) en minutos
    """

    def __init__(self, tipo_dia=TIPO_DIA, tipos_dias=None):
        self.tipos_dias = list(tipos_dias) if tipos_dias else [tipo_dia]
        for t in self.tipos_dias:
            if t not in TIPOS_DIA:
                raise ValueError("Tipo de dia desconocido '%s' (validos: %s)" % (t, ", ".join(TIPOS_DIA)))
        self.tipo_dia = self.tipos_dias[0]             # tipo del dia 1 (el de la noche que se planifica)
        usados = sorted(set(self.tipos_dias))

        es_all = pd.read_csv(RUTA_ESCENARIOS)
        od_all = pd.read_csv(RUTA_OD_HORA)
        ing_all = pd.read_csv(RUTA_INGRESO)
        self.demanda, self.od, self.ingreso, self.desviacion_od = {}, {}, {}, 0.0
        for t in usados:
            es = es_all[es_all.tipo_dia == t]
            self.demanda[t] = {}
            for esc in ESCENARIOS:
                m = es[es.escenario == esc].pivot(index="zona", columns="hora", values="viajes_medios_dia")
                self.demanda[t][esc] = m.reindex(index=ZONAS, columns=range(HORAS)).fillna(0.0).to_numpy() * ESCALA

            od = od_all[od_all.tipo_dia == t]
            o = np.zeros((HORAS, 5, 5))
            for h in range(HORAS):
                sub = od[od.hora == h].pivot(index="zona_inicio", columns="zona_fin", values="proporcion")
                o[h] = sub.reindex(index=ZONAS, columns=ZONAS).fillna(0.0).to_numpy()
            # El fichero esta redondeado a 5 decimales: cada origen suma 1 +- 0,00005. Se reescala para que sume
            # exactamente 1 y la simulacion no cree ni pierda patinetes. Se guarda la desviacion original.
            sumas = o.sum(axis=2, keepdims=True)
            self.desviacion_od = max(self.desviacion_od, float(np.abs(sumas - 1.0).max()))
            self.od[t] = o / sumas

            ing = ing_all[ing_all.tipo_dia == t]
            self.ingreso[t] = ing.pivot(index="zona", columns="hora", values="ingreso_usd") \
                                 .reindex(index=ZONAS, columns=range(HORAS)).to_numpy()

        self.tiempos = pd.read_csv(RUTA_TIEMPOS, index_col=0).reindex(index=ZONAS + [TALLER], columns=ZONAS + [TALLER])

    def tipo_del_dia(self, n):
        """Tipo de dia del dia n del horizonte (n = 0 es el dia 1)."""
        return self.tipos_dias[n] if n < len(self.tipos_dias) else self.tipos_dias[-1]

    def comprobar(self):
        """Comprobaciones basicas de coherencia. Devuelve un diccionario de resultados y falla si algo no cuadra."""
        res = {}
        assert self.desviacion_od < 1e-3, "Las proporciones origen-destino no suman 1 (desviacion %.5f)" % self.desviacion_od
        assert not self.tiempos.isna().any().any(), "Faltan tiempos en la matriz"
        for t in self.demanda:
            assert np.allclose(self.od[t].sum(axis=2), 1.0, atol=1e-12)
            assert not np.isnan(self.ingreso[t]).any(), "Faltan ingresos por zona y hora (%s)" % t
            for esc in ESCENARIOS:
                assert self.demanda[t][esc].sum() > 0, "Sin demanda para %s / %s" % (t, esc)
                res["viajes_dia_%s_%s" % (t, esc)] = float(self.demanda[t][esc].sum())
            res["ingreso_medio_usd_" + t] = float(self.ingreso[t].mean())
        res["desviacion_od"] = self.desviacion_od
        return res


# ------------------------- Estado de la flota -------------------------
class Estado:
    """Estado de la flota al empezar la noche (lo introduce el administrador).

    cargados : {zona: patinetes con bateria}      bajos : {zona: patinetes bajos}      stock_taller : cargados en el taller
    """

    def __init__(self, cargados, bajos, stock_taller):
        self.cargados = np.array([cargados[z] for z in ZONAS], dtype=float)
        self.bajos = np.array([bajos[z] for z in ZONAS], dtype=float)
        self.stock_taller = float(stock_taller)

    def flota_en_zonas(self):
        return float(self.cargados.sum() + self.bajos.sum())


# ------------------------- Tareas y rutas -------------------------
# Tarea:  ("CAMBIO", zona, rep, rec)            -> taller -> zona -> taller; deja rep cargados y recoge rec bajos
#         ("REUBICAR", origen, destino, mov)    -> mueve mov cargados de origen a destino; el camion se queda en destino
# Ruta:   {camion: [tareas]}  con camion = 1..4 (los que falten no hacen nada)

def cambio(zona, rep, rec):
    return ("CAMBIO", zona, rep, rec)


def reubicar(origen, destino, mov):
    return ("REUBICAR", origen, destino, mov)


def _t(datos, a, b):
    return float(datos.tiempos.loc[a, b])


def calcular_camion(datos, tareas):
    """Recorre las tareas de UN camion y devuelve (tiempo_total, eventos, detalle).

    eventos : lista (minuto, indice_zona, delta_cargados): +n entran en la zona, -n salen de la zona
    detalle : lista de dicts con la tarea, su minuto de inicio y de fin
    El camion empieza en el taller. Cada patinete se maneja 1 min cada vez que se carga o se descarga.
    """
    lugar, t = TALLER, 0.0
    eventos, detalle = [], []
    for tarea in tareas:
        inicio = t
        if tarea[0] == "CAMBIO":
            _, z, rep, rec = tarea
            # ir al taller (si no esta), cargar rep, viajar a z, descargar rep (entran en z)
            t += _t(datos, lugar, TALLER) + MANIPULACION_MIN * rep + _t(datos, TALLER, z) + MANIPULACION_MIN * rep
            eventos.append((t, ZONAS.index(z), +rep))
            # cargar rec bajos, volver al taller, descargarlos
            t += MANIPULACION_MIN * rec + _t(datos, z, TALLER) + MANIPULACION_MIN * rec
            lugar = TALLER
        elif tarea[0] == "REUBICAR":
            _, o, w, mov = tarea
            t += _t(datos, lugar, o)                       # llegar a la zona origen
            eventos.append((t, ZONAS.index(o), -mov))      # los cargados salen de o (se cuenta al llegar: criterio conservador)
            t += MANIPULACION_MIN * mov + _t(datos, o, w) + MANIPULACION_MIN * mov
            eventos.append((t, ZONAS.index(w), +mov))      # y entran en w al terminar
            lugar = w
        else:
            raise ValueError("Tarea desconocida: %r" % (tarea,))
        detalle.append({"tarea": tarea, "inicio": inicio, "fin": t})
    return t, eventos, detalle


def evaluar_ruta(datos, estado, ruta):
    """Calcula tiempos y comprueba las restricciones fisicas de una ruta (aunque este incompleta).

    Devuelve un dict con: problemas (lista de textos; vacia si la ruta es valida), tiempos (por camion),
    detalle (por camion), cargados_finales (por zona, al terminar la noche), rep_total, rec_por_zona.
    """
    problemas = []
    tiempos, detalles, eventos = {}, {}, []
    rep_total, rec_zona = 0, np.zeros(5)

    for cam, tareas in sorted(ruta.items()):
        # comprobaciones de cada tarea
        for tarea in tareas:
            if tarea[0] == "CAMBIO":
                _, z, rep, rec = tarea
                cants, zonas = [rep, rec], [z]
            else:
                _, o, w, mov = tarea
                cants, zonas = [mov], [o, w]
                if o == w:
                    problemas.append("Camion %d: reubicar de %s a la misma zona." % (cam, o))
            for z_ in zonas:
                if z_ not in ZONAS:
                    problemas.append("Camion %d: zona desconocida '%s'." % (cam, z_))
            if any(c < 0 or c > CAPACIDAD or int(c) != c for c in cants):
                problemas.append("Camion %d: cantidades fuera de 0-%d en %r." % (cam, CAPACIDAD, tarea))
        if any(p.startswith("Camion %d: zona desconocida" % cam) for p in problemas):
            continue
        t, ev, det = calcular_camion(datos, tareas)
        tiempos[cam], detalles[cam] = t, det
        eventos += ev
        if t > JORNADA_MIN + 1e-9:
            problemas.append("Camion %d: la ruta dura %.1f min (maximo %d)." % (cam, t, JORNADA_MIN))
        for tarea in tareas:
            if tarea[0] == "CAMBIO":
                rep_total += tarea[2]
                rec_zona[ZONAS.index(tarea[1])] += tarea[3]

    # stock del taller y bajos disponibles
    if rep_total > estado.stock_taller:
        problemas.append("Se reponen %d patinetes y el taller solo tiene %d." % (rep_total, estado.stock_taller))
    for i, z in enumerate(ZONAS):
        if rec_zona[i] > estado.bajos[i]:
            problemas.append("Se recogen %d bajos en %s y solo hay %d." % (rec_zona[i], z, estado.bajos[i]))

    # linea de tiempo de los patinetes cargados de cada zona: nunca por debajo de 0.
    # A la misma hora se procesan primero las salidas (criterio conservador).
    cargados = estado.cargados.copy()
    for minuto, i, delta in sorted(eventos, key=lambda e: (round(e[0], 6), e[2])):
        cargados[i] += delta
        if cargados[i] < -1e-9:
            problemas.append("En %s no hay patinetes cargados suficientes a los %.1f min (faltan %d)." %
                             (ZONAS[i], minuto, int(round(-cargados[i]))))
            cargados[i] = 0.0                              # para no repetir el aviso en cascada

    return {"problemas": problemas, "tiempos": tiempos, "detalle": detalles,
            "cargados_finales": cargados, "rep_total": rep_total, "rec_por_zona": rec_zona}


def texto_ruta(ev):
    """Resumen legible de la ruta de cada camion (tareas, minutos de inicio y fin)."""
    lineas = []
    for cam, det in sorted(ev["detalle"].items()):
        if not det:
            lineas.append("Camion %d: sin tareas" % cam)
            continue
        partes = []
        for d in det:
            tarea = d["tarea"]
            if tarea[0] == "CAMBIO":
                partes.append("cambio en %s (repone %d, recoge %d) [%.0f-%.0f]" % (tarea[1], tarea[2], tarea[3], d["inicio"], d["fin"]))
            else:
                partes.append("reubicar %d de %s a %s [%.0f-%.0f]" % (tarea[3], tarea[1], tarea[2], d["inicio"], d["fin"]))
        lineas.append("Camion %d (%.0f min): " % (cam, ev["tiempos"][cam]) + " -> ".join(partes))
    return "\n".join(lineas)


# ------------------------- Simulacion del dia -------------------------
def simular_dia(datos, cargados_inicio, escenario, tipo_dia=None):
    """Recorre las 24 horas de un escenario a partir de los patinetes cargados de cada zona al empezar el dia.

    En cada hora: viajes atendidos = min(demanda, patinetes cargados de la zona); los demas se pierden.
    Los atendidos salen de su zona y llegan a su destino al empezar la hora siguiente (proporciones origen-destino).
    Un patinete cargado no se queda sin bateria durante el dia (bateria a mitad de dia no se modela).
    """
    tipo_dia = tipo_dia or datos.tipo_dia
    demanda = datos.demanda[tipo_dia][escenario]
    od = datos.od[tipo_dia]
    precio = datos.ingreso[tipo_dia]
    stock = np.asarray(cargados_inicio, dtype=float).copy()
    total = stock.sum()
    atendidos = np.zeros((5, HORAS))
    perdidos = np.zeros((5, HORAS))
    llegadas = np.zeros(5)
    for h in range(HORAS):
        att = np.minimum(demanda[:, h], stock)
        atendidos[:, h] = att
        perdidos[:, h] = demanda[:, h] - att
        llegan = od[h].T @ att                  # llegan[j] = suma_i att[i] * proporcion(i -> j)
        llegadas += llegan
        stock = stock - att + llegan
        assert abs(stock.sum() - total) < 1e-6, "Se han creado o perdido patinetes en la simulacion"
    ingreso = float((atendidos * precio).sum())
    return {"ingreso": ingreso, "atendidos": atendidos, "perdidos": perdidos,
            "demanda": float(demanda.sum()), "stock_final": stock, "llegadas_zona": llegadas}


# ------------------------- Horizonte rodante -------------------------
def bajos_nuevos(sim, autonomia_km=AUTONOMIA_KM):
    """Patinetes que pasan a bajos al final de un dia (regla por km, 02/11).

    km recorridos en el dia = viajes atendidos x 1,96 km. Cada patinete puede gastar la autonomia util
    (autonomia x 0,90) antes de quedar bajo, asi que pasan a bajos km / autonomia util patinetes. Se reparten
    segun la zona donde terminan los viajes, sin pasar de los cargados que hay en cada zona; si en una zona no hay
    cargados suficientes, lo que sobra se reparte entre las demas (asi el total no depende de como esten repartidos).
    Con 30 km y la demanda normal salen unos 53 al dia (coincide con los ~52 del Modelo_Simple).
    """
    util = autonomia_km * (1.0 - UMBRAL_BAJO)
    stock = sim["stock_final"]
    total = min(sim["llegadas_zona"].sum() * KM_POR_VIAJE / util, stock.sum())
    peso = sim["llegadas_zona"].astype(float)
    nuevos = np.zeros(5)
    for _ in range(5):                                  # como mucho 5 vueltas (una por zona que se llena)
        resto = total - nuevos.sum()
        libres = (nuevos < stock - 1e-9) & (peso > 0)
        if resto <= 1e-9 or not libres.any():
            break
        reparto = np.where(libres, peso, 0.0)
        nuevos = np.minimum(nuevos + resto * reparto / reparto.sum(), stock)
    return nuevos


def simular_horizonte(datos, cargados_inicio, escenario, dias=HORIZONTE_DIAS, autonomia_km=AUTONOMIA_KM):
    """Encadena 'dias' dias seguidos con el MISMO escenario (horizonte rodante, 02/11). Cada dia usa los datos de su
    tipo (laborable o fin de semana) segun datos.tipos_dias.

    Dia 1 parte de los cargados que deja la ruta del jefe. Al final de cada dia pasan a bajos los patinetes que
    han gastado su autonomia (bajos_nuevos). Las noches siguientes no sale ningun camion: el dia siguiente empieza
    con los cargados que quedan. Se trabaja con numeros decimales, como el resto de la simulacion (la demanda
    media por hora no es entera); no se redondea.
    Devuelve la lista de simulaciones diarias (las de simular_dia, con 'cargados_inicio' y 'nuevos_bajos').
    """
    cargados = np.asarray(cargados_inicio, dtype=float).copy()
    resultado = []
    for n in range(dias):
        sim = simular_dia(datos, cargados, escenario, datos.tipo_del_dia(n))
        sim["tipo_dia"] = datos.tipo_del_dia(n)
        sim["cargados_inicio"] = cargados.copy()
        sim["nuevos_bajos"] = bajos_nuevos(sim, autonomia_km)
        cargados = sim["stock_final"] - sim["nuevos_bajos"]
        resultado.append(sim)
    return resultado


# ------------------------- KPI de una ruta -------------------------
def _resumir(por_esc):
    """Valor ESPERADO (media de los 3 escenarios) y del PEOR escenario de cada KPI."""
    def media(k):
        return np.mean([por_esc[e][k] for e in ESCENARIOS], axis=0)
    esperado = {k: media(k) for k in ("beneficio", "coste", "demanda_atendida", "perdidos_zona")}
    peor = {"beneficio": min(por_esc[e]["beneficio"] for e in ESCENARIOS),
            "coste": por_esc[ESCENARIOS[0]]["coste"],
            "demanda_atendida": min(por_esc[e]["demanda_atendida"] for e in ESCENARIOS),
            "perdidos_zona": np.max([por_esc[e]["perdidos_zona"] for e in ESCENARIOS], axis=0)}
    return {"por_escenario": por_esc, "esperado": esperado, "peor": peor}


def calcular_kpis(datos, estado, ruta, dias=HORIZONTE_DIAS, autonomia_km=AUTONOMIA_KM):
    """Calcula los 5 KPI de una ruta para el DIA 1 y para el HORIZONTE de 'dias' dias.

    1 Beneficio = ingresos - coste de camiones        2 Coste de camiones = 25 USD/h x horas de ruta (solo esta noche)
    3 Demanda atendida (%)                            4 Viajes perdidos por zona
    5 Estado al terminar la noche: bajos sin cambiar (por zona) y cargados que quedan en la reserva del taller
    Resultado: k["dia1"] y k["horizonte"], cada uno con 'esperado', 'peor' y 'por_escenario'; k["dias"] guarda las
    simulaciones diarias de cada escenario.
    """
    ev = evaluar_ruta(datos, estado, ruta)
    coste = COSTE_HORA_CAMION * sum(ev["tiempos"].values()) / 60.0
    dia1, horiz, sims = {}, {}, {}
    for esc in ESCENARIOS:
        s = simular_horizonte(datos, ev["cargados_finales"], esc, dias, autonomia_km)
        sims[esc] = s
        dia1[esc] = {"beneficio": s[0]["ingreso"] - coste, "coste": coste,
                     "demanda_atendida": float(s[0]["atendidos"].sum() / s[0]["demanda"]),
                     "perdidos_zona": s[0]["perdidos"].sum(axis=1)}
        horiz[esc] = {"beneficio": sum(x["ingreso"] for x in s) - coste, "coste": coste,
                      "demanda_atendida": float(sum(x["atendidos"].sum() for x in s) / sum(x["demanda"] for x in s)),
                      "perdidos_zona": sum(x["perdidos"].sum(axis=1) for x in s)}
    estado_final = {"bajos_sin_cambiar": estado.bajos - ev["rec_por_zona"],
                    "reserva_taller": estado.stock_taller - ev["rep_total"]}
    return {"problemas": ev["problemas"], "evaluacion": ev, "dia1": _resumir(dia1),
            "horizonte": _resumir(horiz), "dias": sims, "n_dias": dias, "estado_final": estado_final}


def texto_kpis(k):
    """Tabla de los 5 KPI: dia 1 y horizonte, cada uno con el valor esperado y el del peor escenario."""
    d, h, ef = k["dia1"], k["horizonte"], k["estado_final"]
    cab = "%-30s %10s %10s   %10s %10s" % ("KPI", "Dia 1", "(peor)", "%d dias" % k["n_dias"], "(peor)")

    def fila(nombre, f, fmt="%10.0f"):
        return "%-30s " % nombre + " ".join(fmt % v for v in f(d)) + "   " + " ".join(fmt % v for v in f(h))
    l = [cab,
         fila("Beneficio (USD)", lambda x: (x["esperado"]["beneficio"], x["peor"]["beneficio"])),
         fila("Coste de camiones (USD)", lambda x: (x["esperado"]["coste"], x["peor"]["coste"])),
         fila("Demanda atendida (%)", lambda x: (100 * x["esperado"]["demanda_atendida"], 100 * x["peor"]["demanda_atendida"]), "%10.1f"),
         fila("Viajes perdidos (total)", lambda x: (x["esperado"]["perdidos_zona"].sum(), x["peor"]["perdidos_zona"].sum()))]
    for i, z in enumerate(ZONAS):
        l.append(fila("   perdidos en " + z, lambda x: (x["esperado"]["perdidos_zona"][i], x["peor"]["perdidos_zona"][i]), "%10.1f"))
    l.append("Estado al terminar la noche: bajos sin cambiar = %d (%s); cargados en la reserva del taller = %d"
             % (ef["bajos_sin_cambiar"].sum(), ", ".join("%s %d" % (z, b) for z, b in zip(ZONAS, ef["bajos_sin_cambiar"])), ef["reserva_taller"]))
    l.append("(Valores esperados = media de los 3 escenarios; 'peor' = escenario mas desfavorable. Coste solo de esta noche.)")
    return "\n".join(l)


def texto_dias(k, escenario="normal"):
    """Detalle dia a dia de un escenario: cargados al empezar, viajes perdidos e ingresos."""
    l = ["Dia a dia (escenario %s):" % escenario,
         "  %-5s %-14s %10s %10s %10s %12s" % ("Dia", "Tipo", "Cargados", "Demanda", "Perdidos", "Ingreso USD")]
    for n, s in enumerate(k["dias"][escenario], 1):
        l.append("  %-5d %-14s %10.0f %10.0f %10.1f %12.0f" % (n, s.get("tipo_dia", ""), s["cargados_inicio"].sum(), s["demanda"],
                                                         s["perdidos"].sum(), s["ingreso"]))
    return "\n".join(l)

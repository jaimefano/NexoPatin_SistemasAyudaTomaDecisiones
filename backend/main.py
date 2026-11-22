# -*- coding: utf-8 -*-
"""
Servidor FastAPI del SATD. Reutiliza Sistema/simulador.py y Sistema/sugerencias.py tal cual.
Sin estado en el servidor de la ruta: el navegador envia la ruta en cada llamada
(solo se guarda el estado de la flota de la noche, que fija el administrador).

Ejecutar desde la carpeta backend/:   py -m uvicorn main:app --reload --port 8000

Datos persistentes en SQLite (backend/db.py). Toda la API exige sesión salvo login, registro y logout.
La noche que se planifica es la de hoy (hora de España) y el horizonte son los 3 días siguientes.
"""
import csv
import datetime
import json
import os
import sys
import time
from zoneinfo import ZoneInfo

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(RAIZ, "Sistema"))
sys.path.insert(0, AQUI)
import simulador as sim          # noqa: E402
import sugerencias as sug        # noqa: E402
import planes                    # noqa: E402
import db                        # noqa: E402

RUTA_MAPA = os.path.join(RAIZ, "Datos", "Entradas_Modelo", "zonas_mapa.geojson")
RUTA_PUNTOS = os.path.join(RAIZ, "Datos", "Entradas_Modelo", "puntos_zonas.csv")
ZONA_HORARIA = ZoneInfo("Europe/Madrid")
COOKIE = "satd_sesion"
COOKIE_SEGURA = os.environ.get("SATD_COOKIE_SEGURA") == "1"     # "1" cuando se sirve por HTTPS
PUBLICAS = {"/api/login", "/api/registro", "/api/logout"}

app = FastAPI(title="SATD")
db.iniciar()


@app.middleware("http")
async def exigir_sesion(request: Request, siguiente):
    """Toda la API (salvo login, registro y logout) exige una sesión válida; /api/admin/* exige además el rol admin."""
    ruta = request.url.path
    if ruta.startswith("/api/") and ruta not in PUBLICAS:
        u = db.usuario_de_sesion(request.cookies.get(COOKIE))
        if u is None:
            return JSONResponse({"detail": "Tu sesión ha caducado o no has iniciado sesión."}, status_code=401)
        if ruta.startswith("/api/admin/") and u["rol"] != "admin":
            return JSONResponse({"detail": "Solo el administrador puede hacer esto."}, status_code=403)
        request.state.usuario = u
    return await siguiente(request)


def hoy():
    return datetime.datetime.now(ZONA_HORARIA).date()


def tipo_de(d):
    return "fin_de_semana" if d.weekday() >= 5 else "laborable"     # los festivos no se modelan


_datos = {}


def datos_de(tipos):
    tipos = tuple(tipos)
    if tipos not in _datos:
        _datos[tipos] = sim.Datos(tipos_dias=list(tipos))
    return _datos[tipos]


def leer_estado():
    """Noche de hoy. La flota es la que cargó el administrador para hoy o, si aún no lo ha hecho, la última anterior
    (flota_de_hoy = False). El día 1 del horizonte es mañana; cada día usa su tipo (laborable o fin de semana)."""
    noche = hoy()
    flota = db.flota_vigente(noche.isoformat())
    if flota is None:
        raise HTTPException(503, "El administrador todavía no ha cargado el estado de la flota.")
    tipos = [tipo_de(noche + datetime.timedelta(days=n)) for n in range(1, sim.HORIZONTE_DIAS + 1)]
    return {"fecha": noche.isoformat(), "tipo_dia": tipos[0], "tipos_dias": tipos,
            "cargados": flota["cargados"], "bajos": flota["bajos"], "stock_taller": flota["stock_taller"],
            "fecha_flota": flota["fecha_flota"], "flota_de_hoy": flota["fecha_flota"] == noche.isoformat()}


def estado_y_datos():
    e = leer_estado()
    return sim.Estado(e["cargados"], e["bajos"], e["stock_taller"]), datos_de(e["tipos_dias"]), e


def a_ruta(r):
    """JSON {"1": [["CAMBIO","Centro",20,20], ...]} -> {1: [("CAMBIO","Centro",20,20)]}"""
    if r is None:
        return {}
    if not isinstance(r, dict):
        raise HTTPException(400, "La ruta debe ser un objeto {camion: [tareas]}.")
    out = {}
    for c, ts in r.items():
        try:
            cam = int(c)
        except (ValueError, TypeError):
            raise HTTPException(400, "Camion '%s' no valido (debe ser 1-%d)." % (c, sim.N_CAMIONES))
        if not 1 <= cam <= sim.N_CAMIONES:
            raise HTTPException(400, "Camion %d no existe (hay %d)." % (cam, sim.N_CAMIONES))
        if not isinstance(ts, list):
            raise HTTPException(400, "Las tareas del camion %d deben ser una lista." % cam)
        lst = []
        for t in ts:
            ok = (isinstance(t, (list, tuple)) and len(t) == 4 and t[0] in ("CAMBIO", "REUBICAR")
                  and isinstance(t[1], str) and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in
                                                    ((t[2], t[3]) if t[0] == "CAMBIO" else (t[3],)))
                  and (t[0] == "CAMBIO" or isinstance(t[2], str)))
            if not ok:
                raise HTTPException(400, "Tarea mal formada en el camion %d: %r" % (cam, t))
            lst.append(tuple(t))
        out[cam] = lst
    return out


def a_limites(l):
    if l is None:
        l = {}
    if not isinstance(l, dict):
        raise HTTPException(400, "Los limites deben ser un objeto.")
    v = [l.get(k) for k in ("reserva_min", "demanda_min", "coste_max")]
    if any(x is not None and (isinstance(x, bool) or not isinstance(x, (int, float))) for x in v):
        raise HTTPException(400, "Los limites deben ser numeros.")
    return sug.Limites(*v)


def f(x):
    return float(x)


def kpis_planos(k):
    """Valores esperados (3 dias) y del dia 1 de un resultado de calcular_kpis, en tipos de JSON."""
    r = sug.resumen_kpis(k)
    r["bajos_sin_cambiar"] = float(k["estado_final"]["bajos_sin_cambiar"].sum())
    r["demanda_dia1"] = float(k["dia1"]["esperado"]["demanda_atendida"])
    r["perdidos_zona"] = [f(v) for v in k["horizonte"]["esperado"]["perdidos_zona"]]
    return r


def flota_final(estado, ev, k):
    """Estado por zona al terminar la noche con la ruta (cargados, bajos sin cambiar) y reserva del taller."""
    return {"zonas": {z: {"cargados": f(ev["cargados_finales"][i]), "bajos": f(k["estado_final"]["bajos_sin_cambiar"][i])}
                      for i, z in enumerate(sim.ZONAS)},
            "taller": f(k["estado_final"]["reserva_taller"])}


def efecto(base, r):
    d = {c: r[c] - base[c] for c in r if c != "perdidos_zona"}
    d["bajos_sin_cambiar"] = r["bajos_sin_cambiar"] - base["bajos_sin_cambiar"]
    return d


def tarea_json(t):
    return list(t)


# ------------------------------------------------------------------ API
@app.get("/api/estado")
def estado():
    e = leer_estado()
    d = datos_de(e["tipos_dias"])
    demanda_zona = [f(np.mean([d.demanda[e["tipo_dia"]][esc][i].sum() for esc in sim.ESCENARIOS])) for i in range(5)]
    return {**e, "demanda_zona": demanda_zona, "zonas": sim.ZONAS, "taller": sim.TALLER, "n_camiones": sim.N_CAMIONES, "jornada_min": sim.JORNADA_MIN,
            "capacidad": sim.CAPACIDAD, "coste_hora_camion": sim.COSTE_HORA_CAMION}


@app.get("/api/demanda_horaria")
def demanda_horaria():
    """Demanda (viajes) del dia siguiente a la noche que se planifica, por zona y hora: esperada (media de los 3 escenarios), floja y fuerte."""
    e = leer_estado()
    d = datos_de(e["tipos_dias"])
    t = d.tipo_dia
    por_esc = {esc: d.demanda[t][esc] for esc in sim.ESCENARIOS}
    return {"fecha": e["fecha"], "tipo_dia": t, "zonas": sim.ZONAS, "horas": list(range(sim.HORAS)),
            "esperado": matriz_2d(np.mean([por_esc[esc] for esc in sim.ESCENARIOS], axis=0)),
            "flojo": matriz_2d(por_esc["flojo"]), "fuerte": matriz_2d(por_esc["fuerte"])}


@app.get("/api/mapa")
def mapa():
    with open(RUTA_MAPA, encoding="utf-8") as fh:
        g = json.load(fh)
    puntos = {}
    with open(RUTA_PUNTOS, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            puntos[row["lugar"]] = {"lat": float(row["lat"]), "lon": float(row["lon"])}
    return {"geojson": g, "puntos": puntos}


@app.post("/api/candidatas")
def candidatas(cuerpo: dict):
    estado_, datos, _ = estado_y_datos()
    ruta, limites = a_ruta(cuerpo.get("ruta")), a_limites(cuerpo.get("limites"))
    k0 = sim.calcular_kpis(datos, estado_, ruta)
    base = kpis_planos(k0)
    base["tiempos"] = {str(c): f(t) for c, t in k0["evaluacion"]["tiempos"].items()}
    base["avisos"] = limites.incumplidos(k0)
    base["flota"] = flota_final(estado_, k0["evaluacion"], k0)
    _, evaluadas = sug.evaluar_candidatas(datos, estado_, ruta, limites)
    out = []
    for e in evaluadas:
        nueva = sug.anadir(ruta, e["camion"], e["tarea"])
        k = sim.calcular_kpis(datos, estado_, nueva)
        r = kpis_planos(k)
        out.append({"camion": e["camion"], "tarea": tarea_json(e["tarea"]), "kpis": r, "delta": efecto(base, r),
                    "tiempo_libre": f(e["tiempo_libre"]), "avisos": e["avisos"],
                    "tiempo_tarea": f(sim.calcular_camion(datos, [e["tarea"]])[0])})
    return {"base": base, "candidatas": out}


@app.post("/api/evaluar")
def evaluar(cuerpo: dict):
    """Efecto de UNA tarea concreta (con las cantidades que se quiera) sobre la ruta actual.
    Si es un cambio, devuelve ademas la curva de beneficio segun los bajos que recoge.
    Si es una reubicacion con destino vacio, compara todos los destinos posibles."""
    estado_, datos, _ = estado_y_datos()
    ruta, limites = a_ruta(cuerpo.get("ruta")), a_limites(cuerpo.get("limites"))
    try:
        cam, tarea = int(cuerpo["camion"]), a_ruta({cuerpo["camion"]: [cuerpo["tarea"]]})[int(cuerpo["camion"])][0]
    except (KeyError, ValueError, TypeError):
        raise HTTPException(400, "Faltan 'camion' o 'tarea', o no son validos.")
    base = kpis_planos(sim.calcular_kpis(datos, estado_, ruta))

    def una(c, t):
        nueva = sug.anadir(ruta, c, t)
        k = sim.calcular_kpis(datos, estado_, nueva)
        r = kpis_planos(k)
        return {"camion": c, "tarea": tarea_json(t), "kpis": r, "delta": efecto(base, r),
                "tiempo_libre": f(sug.tiempo_libre(k["evaluacion"], c)), "problemas": k["problemas"],
                "avisos": limites.incumplidos(k),
                "tiempo_tarea": f(sim.calcular_camion(datos, [t])[0]),
                "flota": flota_final(estado_, k["evaluacion"], k)}

    res = una(cam, tarea)
    if tarea[0] == "CAMBIO":
        curva = []
        for rec in range(0, sim.CAPACIDAD + 1):
            r = una(cam, sim.cambio(tarea[1], tarea[2], rec))
            curva.append({"rec": rec, "beneficio": r["delta"]["beneficio"], "valida": not r["problemas"]})
        res["curva"] = curva
    elif tarea[0] == "REUBICAR" and cuerpo.get("comparar"):
        res["destinos"] = []
        for w in sim.ZONAS:
            if w == tarea[1]:
                continue
            r = una(cam, sim.reubicar(tarea[1], w, tarea[3]))
            res["destinos"].append({"destino": w, "delta": r["delta"], "tiempo_tarea": r["tiempo_tarea"],
                                    "problemas": r["problemas"], "avisos": r["avisos"], "kpis": r["kpis"]})
    return res


@app.post("/api/resultado")
def resultado(cuerpo: dict):
    """Pantalla 'Ruta terminada': esperado y peor escenario frente a no hacer nada, plan por camion, estado final."""
    estado_, datos, _ = estado_y_datos()
    ruta = a_ruta(cuerpo.get("ruta"))
    k0 = sim.calcular_kpis(datos, estado_, {})
    k1 = sim.calcular_kpis(datos, estado_, ruta)

    def bloque(k):
        h, d = k["horizonte"], k["dia1"]
        out = {}
        for modo in ("esperado", "peor"):
            out[modo] = {"beneficio3": f(h[modo]["beneficio"]), "beneficio1": f(d[modo]["beneficio"]),
                         "coste": f(h[modo]["coste"]), "demanda": f(h[modo]["demanda_atendida"]),
                         "perdidos": f(h[modo]["perdidos_zona"].sum()),
                         "perdidos_zona": [f(v) for v in h[modo]["perdidos_zona"]]}
        out["bajos_sin_cambiar"] = f(k["estado_final"]["bajos_sin_cambiar"].sum())
        out["reserva_taller"] = f(k["estado_final"]["reserva_taller"])
        return out

    ev = k1["evaluacion"]
    plan = {str(c): {"minutos": f(ev["tiempos"].get(c, 0.0)),
                     "tareas": [{"tarea": tarea_json(d["tarea"]), "inicio": f(d["inicio"]), "fin": f(d["fin"])}
                                for d in ev["detalle"].get(c, [])]}
            for c in range(1, sim.N_CAMIONES + 1)}
    return {"nada": bloque(k0), "ruta": bloque(k1), "plan": plan, "problemas": k1["problemas"],
            "flota": flota_final(estado_, ev, k1), "zonas": sim.ZONAS}


# ------------------------------------------------------------------ Planes completos (flujo v2)
_cache_planes = {}      # clave (estado de la flota + tipo de dia) -> conjunto de planes generado


def conjunto_planes():
    """Planes generados para el estado de la flota actual. Se cachea: al cambiar el estado (admin) la clave cambia
    y se regeneran; las entradas antiguas se descartan."""
    estado_, datos, e = estado_y_datos()
    clave = planes.clave_estado(estado_, tuple(e["tipos_dias"]))
    if clave not in _cache_planes:
        _cache_planes.clear()
        _cache_planes[clave] = planes.generar(datos, estado_)
    return _cache_planes[clave]


def plan_publico(p, limites):
    """El plan tal como lo ve el frontend (sin campos internos), con los avisos de limites (vacios si ya pasaron el filtro)."""
    return {"id": p["id"], "ruta": {str(c): [list(t) for t in ts] for c, ts in p["ruta"].items()},
            "n_tareas": p["n_tareas"], "minutos": p["minutos"], "camiones_usados": p["camiones_usados"],
            "tareas": p["tareas"], "kpis": p["kpis"], "delta": p["delta"], "avisos": []}


@app.post("/api/planes")
def api_planes(cuerpo: dict = None):
    """Planes completos de la noche tras el primer filtro simple (factibles, sin duplicados, dentro de los limites)."""
    limites = a_limites((cuerpo or {}).get("limites"))
    conj = conjunto_planes()
    lista = planes.filtrar(conj, limites)
    return {"estado": "listo", "nada": conj["nada"], "n_generados": conj["n_generados"], "n_factibles": len(conj["planes"]),
            "planes": [plan_publico(p, limites) for p in lista]}


def _bloque(k):
    """Esperado y peor escenario (3 dias y dia 1) + estado final de una ruta, y beneficio acumulado por dia."""
    h, d = k["horizonte"], k["dia1"]
    out = {}
    for modo in ("esperado", "peor"):
        out[modo] = {"beneficio3": f(h[modo]["beneficio"]), "beneficio1": f(d[modo]["beneficio"]),
                     "coste": f(h[modo]["coste"]), "demanda": f(h[modo]["demanda_atendida"]),
                     "perdidos": f(h[modo]["perdidos_zona"].sum()),
                     "perdidos_zona": [f(v) for v in h[modo]["perdidos_zona"]]}
    out["bajos_sin_cambiar"] = f(k["estado_final"]["bajos_sin_cambiar"].sum())
    out["reserva_taller"] = f(k["estado_final"]["reserva_taller"])
    # Beneficio acumulado al final de cada dia (ingresos hasta ese dia menos el coste de esta noche), por escenario
    coste = f(h["esperado"]["coste"])
    acum = {}
    for esc, dias in k["dias"].items():
        tot, v = 0.0, []
        for s in dias:
            tot += s["ingreso"]
            v.append(tot - coste)
        acum[esc] = v
    esc_peor = min(acum, key=lambda e: acum[e][-1])
    out["por_dia"] = {"esperado": [float(np.mean([acum[e][i] for e in acum])) for i in range(k["n_dias"])], "peor": acum[esc_peor]}
    return out


def matriz_2d(a):
    return [[round(float(v), 2) for v in fila] for fila in a]


def _plan_camiones(ev):
    return {str(c): {"minutos": f(ev["tiempos"].get(c, 0.0)),
                     "tareas": [{"tarea": tarea_json(d["tarea"]), "inicio": f(d["inicio"]), "fin": f(d["fin"])}
                                for d in ev["detalle"].get(c, [])]}
            for c in range(1, sim.N_CAMIONES + 1)}


@app.post("/api/comparar")
def comparar(cuerpo: dict):
    """Esperado y peor escenario de 1-3 rutas (planes de la lista o propios) y de 'no hacer nada'."""
    estado_, datos, _ = estado_y_datos()
    rutas = cuerpo.get("rutas") or []
    if not isinstance(rutas, list) or not 1 <= len(rutas) <= 3:
        raise HTTPException(400, "Hay que comparar entre 1 y 3 rutas.")
    limites = a_limites(cuerpo.get("limites"))
    out = []
    for r in rutas:
        k = sim.calcular_kpis(datos, estado_, a_ruta(r))
        ev = k["evaluacion"]
        b = _bloque(k)
        b.update({"plan": _plan_camiones(ev), "flota": flota_final(estado_, ev, k), "problemas": k["problemas"],
                  "avisos": limites.incumplidos(k), "minutos": f(sum(ev["tiempos"].values())),
                  "n_tareas": int(sum(len(ts) for ts in a_ruta(r).values()))})
        out.append(b)
    return {"nada": _bloque(sim.calcular_kpis(datos, estado_, {})), "rutas": out, "zonas": sim.ZONAS}


@app.post("/api/kpis_rutas")
def kpis_rutas(cuerpo: dict):
    """KPI (3 dias, esperado) de 1-3 rutas con las mismas claves que un plan de /api/planes: `kpis` y `delta` frente a no hacer nada."""
    estado_, datos, _ = estado_y_datos()
    rutas = cuerpo.get("rutas") or []
    if not isinstance(rutas, list) or not 1 <= len(rutas) <= 3:
        raise HTTPException(400, "Hay que pasar entre 1 y 3 rutas.")
    base = kpis_planos(sim.calcular_kpis(datos, estado_, {}))
    out = []
    for r in rutas:
        rr = kpis_planos(sim.calcular_kpis(datos, estado_, a_ruta(r)))
        out.append({"kpis": rr, "delta": efecto(base, rr)})
    return {"nada": base, "rutas": out}


@app.post("/api/confirmar")
def confirmar(cuerpo: dict, request: Request):
    """El jefe confirma el plan de la noche: se guarda (ruta, KPI, hoja de ruta, quién y cuándo) y la noche queda bloqueada."""
    estado_, datos, e = estado_y_datos()
    if not e["flota_de_hoy"]:
        raise HTTPException(409, "El administrador todavía no ha cargado la flota de esta noche: aún no se puede enviar la ruta.")
    if db.plan_de_la_noche(e["fecha"]):
        raise HTTPException(409, "La ruta de esta noche ya se envió al equipo y no se puede cambiar.")
    ruta = a_ruta(cuerpo.get("ruta"))
    k = sim.calcular_kpis(datos, estado_, ruta)
    if k["problemas"]:
        raise HTTPException(400, "El plan no es factible: " + " ".join(k["problemas"]))
    plan = db.confirmar_plan(e["fecha"], str(cuerpo.get("etiqueta") or "Plan")[:60],
                             {str(c): [list(t) for t in ts] for c, ts in ruta.items()},
                             _bloque(k), _plan_camiones(k["evaluacion"]), request.state.usuario["nombre"])
    if plan is None:
        raise HTTPException(409, "La ruta de esta noche ya se envió al equipo y no se puede cambiar.")
    return plan


@app.get("/api/confirmado")
def confirmado():
    """Plan enviado esta noche (o null)."""
    return {"plan": db.plan_de_la_noche(hoy().isoformat())}


@app.get("/api/historial")
def historial():
    """Planes enviados en noches anteriores (y el de hoy), del más reciente al más antiguo."""
    return {"planes": db.historial()}


@app.post("/api/admin/estado")
def admin_estado(cuerpo: dict, request: Request):
    """El administrador carga el estado de la flota de esta noche (la fecha es la de hoy; no se elige)."""
    def entero(x):
        if isinstance(x, bool) or (isinstance(x, float) and x != int(x)):
            raise ValueError
        return int(x)
    try:
        cargados = {z: entero(cuerpo["cargados"][z]) for z in sim.ZONAS}
        bajos = {z: entero(cuerpo["bajos"][z]) for z in sim.ZONAS}
        stock = entero(cuerpo["stock_taller"])
    except (KeyError, ValueError, TypeError, OverflowError):
        raise HTTPException(400, "Faltan datos o no son números enteros.")
    if any(v < 0 for v in [*cargados.values(), *bajos.values(), stock]):
        raise HTTPException(400, "No puede haber cantidades negativas.")
    noche = hoy().isoformat()
    if db.plan_de_la_noche(noche):
        raise HTTPException(409, "La ruta de esta noche ya se envió: el estado de la flota de hoy ya no se puede cambiar.")
    db.guardar_flota(noche, cargados, bajos, stock, request.state.usuario["nombre"])
    _cache_planes.clear()          # el estado de la flota ha cambiado: los planes se regeneran en la siguiente llamada
    return leer_estado()


# --- Cuentas y sesiones (SQLite; contraseñas con PBKDF2 y sal, nunca en claro; sesión en cookie HttpOnly) ---
_fallos = {}                     # (ip|usuario) -> instantes de los intentos fallidos recientes
MAX_FALLOS, VENTANA_FALLOS = 5, 600


def _poner_cookie(response, correo):
    response.set_cookie(COOKIE, db.abrir_sesion(correo), max_age=int(db.DURACION_SESION.total_seconds()),
                        httponly=True, samesite="lax", secure=COOKIE_SEGURA, path="/")


@app.post("/api/registro")
def registro(cuerpo: dict, response: Response):
    nombre = str(cuerpo.get("nombre", "")).strip()
    correo = str(cuerpo.get("correo", "")).strip().lower()
    clave = str(cuerpo.get("clave", ""))
    if not nombre or not correo or "@" not in correo:
        raise HTTPException(400, "Escribe tu nombre de usuario y un correo válido.")
    if "@" in nombre:
        raise HTTPException(400, "El nombre de usuario no puede llevar @.")
    if not clave:
        raise HTTPException(400, "Escribe una contraseña.")
    u = db.crear_usuario(correo, nombre[:40], clave)
    if isinstance(u, str):
        raise HTTPException(409, u)
    _poner_cookie(response, u["correo"])
    return db.publico(u)


@app.post("/api/login")
def login(cuerpo: dict, request: Request, response: Response):
    ident = str(cuerpo.get("usuario", "")).strip().lower()
    clave = str(cuerpo.get("clave", ""))
    clave_fallos = (request.client.host if request.client else "?") + "|" + ident
    ahora = time.time()
    recientes = [t for t in _fallos.get(clave_fallos, []) if ahora - t < VENTANA_FALLOS]
    if len(recientes) >= MAX_FALLOS:
        raise HTTPException(429, "Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.")
    u = db.buscar_usuario(ident) if ident else None
    if u is None or not db.clave_correcta(u, clave):
        _fallos[clave_fallos] = recientes + [ahora]
        raise HTTPException(401, "Usuario o contraseña incorrectos. Revísalos e inténtalo de nuevo.")
    _fallos.pop(clave_fallos, None)
    _poner_cookie(response, u["correo"])
    return db.publico(u)


@app.post("/api/logout")
def logout(request: Request, response: Response):
    db.cerrar_sesion(request.cookies.get(COOKIE) or "")
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/yo")
def yo(request: Request):
    return db.publico(request.state.usuario)


# --- Frontend compilado (solo si existe frontend/dist, p. ej. dentro de Docker) ---
# Va al final para que las rutas /api tengan prioridad.
_DIST = os.path.join(RAIZ, "frontend", "dist")
if os.path.isdir(_DIST):
    from fastapi.staticfiles import StaticFiles
    from starlette.exceptions import HTTPException as _StarletteHTTPException

    class _Spa(StaticFiles):
        """Rutas del frontend (/admin, /opciones, /acceso…): si no es un fichero, se sirve index.html (el router las resuelve)."""
        async def get_response(self, path, scope):
            try:
                return await super().get_response(path, scope)
            except _StarletteHTTPException as e:
                if e.status_code == 404 and not path.startswith("api/"):
                    return await super().get_response("index.html", scope)
                raise

    app.mount("/", _Spa(directory=_DIST, html=True), name="frontend")

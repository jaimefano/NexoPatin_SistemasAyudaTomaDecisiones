# -*- coding: utf-8 -*-
"""
Base de datos del SATD (SQLite, un solo fichero): usuarios, sesiones, estado de la flota por noche y planes confirmados.

El fichero vive en la carpeta SATD_DATOS (por defecto backend/datos/), que en Docker se monta como volumen
para que los datos sobrevivan al recrear el contenedor. La primera vez que se crea la base de datos se importan
los ficheros JSON antiguos (usuarios.json, estado_noche.json, plan_confirmado.json) si existen.
"""
import datetime
import hashlib
import hmac
import json
import os
import secrets
import sqlite3

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.environ.get("SATD_DATOS") or os.path.join(AQUI, "datos")
RUTA_BD = os.path.join(CARPETA, "satd.db")
DURACION_SESION = datetime.timedelta(hours=12)

ESQUEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    correo      TEXT PRIMARY KEY,                -- clave de la cuenta ("admin" para el administrador inicial)
    nombre      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    rol         TEXT NOT NULL CHECK (rol IN ('admin', 'jefe')),
    sal         TEXT NOT NULL,
    hash        TEXT NOT NULL,
    creado_el   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones (
    token       TEXT PRIMARY KEY,
    correo      TEXT NOT NULL REFERENCES usuarios(correo) ON DELETE CASCADE,
    caduca_el   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS estado_flota (     -- lo introduce el administrador cada noche
    fecha        TEXT PRIMARY KEY,               -- AAAA-MM-DD de la noche
    cargados     TEXT NOT NULL,                  -- JSON {zona: n}
    bajos        TEXT NOT NULL,                  -- JSON {zona: n}
    stock_taller INTEGER NOT NULL,
    guardado_el  TEXT NOT NULL,
    guardado_por TEXT
);
CREATE TABLE IF NOT EXISTS planes_confirmados (  -- uno por noche; una vez confirmado queda bloqueado
    fecha_noche    TEXT PRIMARY KEY,
    etiqueta       TEXT NOT NULL,
    ruta           TEXT NOT NULL,                -- JSON {camion: [tareas]}
    kpis           TEXT NOT NULL,                -- JSON
    hoja_de_ruta   TEXT NOT NULL,                -- JSON {camion: {minutos, tareas}}
    confirmado_el  TEXT NOT NULL,
    confirmado_por TEXT NOT NULL
);
"""


def ahora():
    return datetime.datetime.now().isoformat(timespec="seconds")


def conectar():
    c = sqlite3.connect(RUTA_BD, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def hash_clave(clave, sal=None):
    sal = sal or os.urandom(16).hex()
    return sal, hashlib.pbkdf2_hmac("sha256", clave.encode("utf-8"), bytes.fromhex(sal), 200_000).hex()


def clave_correcta(fila, clave):
    return hmac.compare_digest(hash_clave(clave, fila["sal"])[1], fila["hash"])


# ------------------------------------------------------------------ Arranque e importación de los JSON antiguos
def iniciar():
    os.makedirs(CARPETA, exist_ok=True)
    nueva = not os.path.exists(RUTA_BD)          # los JSON antiguos solo se importan al crear la base de datos
    with conectar() as c:
        c.executescript(ESQUEMA)
        if nueva or c.execute("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'").fetchone()[0] == 0:
            _importar_usuarios(c)                # (también si no queda ningún administrador)
        if nueva:
            _importar_json(c, "estado_noche.json", lambda e: c.execute(
                "INSERT INTO estado_flota VALUES (?, ?, ?, ?, ?, ?)",
                (e["fecha"], json.dumps(e["cargados"]), json.dumps(e["bajos"]), int(e["stock_taller"]), ahora(), "importado")))
            _importar_json(c, "plan_confirmado.json", lambda p: c.execute(
                "INSERT INTO planes_confirmados VALUES (?, ?, ?, ?, ?, ?, ?)",
                (p["fecha_noche"], p["etiqueta"], json.dumps(p["ruta"]), json.dumps(p["kpis"]),
                 json.dumps(p["hoja_de_ruta"]), p["confirmado_el"], "importado")))
        c.execute("DELETE FROM sesiones WHERE caduca_el < ?", (ahora(),))


def _importar_json(c, nombre, insertar):
    ruta = os.path.join(AQUI, nombre)
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            insertar(json.load(f))


def _importar_usuarios(c):
    ruta = os.path.join(AQUI, "usuarios.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            for correo, u in json.load(f).items():
                c.execute("INSERT OR IGNORE INTO usuarios VALUES (?, ?, ?, ?, ?, ?)",
                          (correo, u["nombre"], u["rol"], u["sal"], u["hash"], ahora()))
    if c.execute("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'").fetchone()[0] == 0:
        # Administrador inicial. La contraseña sale de la variable de entorno SATD_ADMIN_CLAVE.
        clave = os.environ.get("SATD_ADMIN_CLAVE")
        if not clave:
            clave = "admin"
            print("AVISO: SATD_ADMIN_CLAVE no está definida; el administrador inicial es admin/admin. Cámbiala antes de publicar.")
        sal, h = hash_clave(clave)
        c.execute("INSERT INTO usuarios VALUES ('admin', 'Administrador', 'admin', ?, ?, ?)", (sal, h, ahora()))


# ------------------------------------------------------------------ Usuarios y sesiones
def publico(fila):
    return {"usuario": fila["correo"], "nombre": fila["nombre"], "rol": fila["rol"]}


def buscar_usuario(identificador):
    """Por correo (o 'admin') o por nombre de usuario, sin distinguir mayúsculas."""
    x = identificador.strip().lower()
    with conectar() as c:
        return c.execute("SELECT * FROM usuarios WHERE correo = ? OR nombre = ? COLLATE NOCASE", (x, x)).fetchone()


def crear_usuario(correo, nombre, clave, rol="jefe"):
    """Devuelve la fila creada o un texto de error si el correo o el nombre ya existen."""
    sal, h = hash_clave(clave)
    with conectar() as c:
        if c.execute("SELECT 1 FROM usuarios WHERE correo = ?", (correo,)).fetchone():
            return "Ya existe una cuenta con ese correo. Inicia sesión."
        if c.execute("SELECT 1 FROM usuarios WHERE nombre = ? COLLATE NOCASE OR correo = ?", (nombre, nombre.lower())).fetchone():
            return "Ese nombre de usuario ya está en uso. Elige otro."
        c.execute("INSERT INTO usuarios VALUES (?, ?, ?, ?, ?, ?)", (correo, nombre, rol, sal, h, ahora()))
        return c.execute("SELECT * FROM usuarios WHERE correo = ?", (correo,)).fetchone()


def abrir_sesion(correo):
    token = secrets.token_urlsafe(32)
    caduca = (datetime.datetime.now() + DURACION_SESION).isoformat(timespec="seconds")
    with conectar() as c:
        c.execute("INSERT INTO sesiones VALUES (?, ?, ?)", (token, correo, caduca))
    return token


def usuario_de_sesion(token):
    if not token:
        return None
    with conectar() as c:
        return c.execute("SELECT u.* FROM sesiones s JOIN usuarios u ON u.correo = s.correo "
                         "WHERE s.token = ? AND s.caduca_el > ?", (token, ahora())).fetchone()


def cerrar_sesion(token):
    with conectar() as c:
        c.execute("DELETE FROM sesiones WHERE token = ?", (token,))


# ------------------------------------------------------------------ Estado de la flota
def flota_vigente(fecha):
    """La flota de esa noche o, si el administrador aún no la ha cargado, la última anterior. None si no hay ninguna."""
    with conectar() as c:
        f = c.execute("SELECT * FROM estado_flota WHERE fecha <= ? ORDER BY fecha DESC LIMIT 1", (fecha,)).fetchone()
    if f is None:
        return None
    return {"fecha_flota": f["fecha"], "cargados": json.loads(f["cargados"]), "bajos": json.loads(f["bajos"]),
            "stock_taller": f["stock_taller"], "guardado_el": f["guardado_el"]}


def guardar_flota(fecha, cargados, bajos, stock, por):
    with conectar() as c:
        c.execute("INSERT OR REPLACE INTO estado_flota VALUES (?, ?, ?, ?, ?, ?)",
                  (fecha, json.dumps(cargados), json.dumps(bajos), int(stock), ahora(), por))


# ------------------------------------------------------------------ Planes confirmados
def _plan(fila):
    return {"fecha_noche": fila["fecha_noche"], "etiqueta": fila["etiqueta"], "ruta": json.loads(fila["ruta"]),
            "kpis": json.loads(fila["kpis"]), "hoja_de_ruta": json.loads(fila["hoja_de_ruta"]),
            "confirmado_el": fila["confirmado_el"], "confirmado_por": fila["confirmado_por"]}


def plan_de_la_noche(fecha):
    with conectar() as c:
        f = c.execute("SELECT * FROM planes_confirmados WHERE fecha_noche = ?", (fecha,)).fetchone()
    return _plan(f) if f else None


def confirmar_plan(fecha, etiqueta, ruta, kpis, hoja, por):
    """Guarda el plan de la noche. Devuelve el plan guardado, o None si esa noche ya tenía uno (queda bloqueado)."""
    try:
        with conectar() as c:
            c.execute("INSERT INTO planes_confirmados VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (fecha, etiqueta, json.dumps(ruta), json.dumps(kpis), json.dumps(hoja), ahora(), por))
    except sqlite3.IntegrityError:
        return None
    return plan_de_la_noche(fecha)


def historial(limite=60):
    with conectar() as c:
        filas = c.execute("SELECT * FROM planes_confirmados ORDER BY fecha_noche DESC LIMIT ?", (limite,)).fetchall()
    return [_plan(f) for f in filas]

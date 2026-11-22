# NexoPatin · Sistema de ayuda a la toma de decisiones

Planificación nocturna de una flota de patinetes eléctricos compartidos. Cada noche, el jefe de operaciones decide qué hacen
los 4 camiones: **cambiar baterías** en una zona (reponer patinetes cargados y recoger los bajos) o **reubicar** patinetes
de una zona a otra. El sistema genera planes completos, los simula sobre datos reales (Lyft, Chicago, octubre–diciembre de
2025) y los muestra lado a lado con sus resultados en el escenario esperado y en el peor.

**El sistema no recomienda:** no ordena los planes por defecto, no les pone nota y no marca ninguno como mejor. La decisión
es del jefe.

## Cómo funciona

| Paso | Pantalla | Qué hace el jefe |
|---|---|---|
| 1 | **Seleccionar** | Explora los planes completos de la noche, los filtra por indicador y marca hasta 3 en la bandeja. |
| 2 | **Plan propio** *(opcional)* | Monta su propio plan tarea a tarea, desde cero o partiendo de uno elegido. |
| 3 | **Comparar** | Ve los planes lado a lado frente a no hacer nada: por día, por zona, robustez y uso de los camiones. |
| 4 | **Decidir** | Confirma un plan: la ruta se envía al equipo y la noche queda cerrada. |

- La noche que se planifica es la de **hoy** (hora de España) y el horizonte son los **3 días siguientes**, cada uno con su
  tipo de día (laborable o fin de semana).
- El **administrador** carga cada noche el estado de la flota (patinetes cargados y bajos por zona y stock del taller).
- **Perfil:** datos de la cuenta, rutas enviadas en noches anteriores y cierre de sesión.

## Desplegar (Docker)

Requisitos: Docker con Docker Compose.

```bash
git clone https://github.com/jaimefano/NexoPatin_SistemasAyudaTomaDecisiones.git
cd NexoPatin_SistemasAyudaTomaDecisiones
cp .env.example .env          # y poner la contraseña del administrador en SATD_ADMIN_CLAVE
docker compose up -d --build
```

La web queda en `http://<servidor>:8000`. Se entra desde la portada (**Entrar**) iniciando sesión o creando una cuenta.
El administrador es el usuario `admin`, con la contraseña de `.env` (solo se aplica la primera vez, al crear la base de datos).

Cuando la web se sirva por **HTTPS** (con un proxy como Caddy delante), poner `SATD_COOKIE_SEGURA=1` en `.env`.

### Copia de seguridad de los datos

Usuarios, sesiones, estado de la flota por noche y rutas enviadas se guardan en SQLite, en el volumen de Docker `satd_datos`.

```bash
docker compose cp satd:/app/datos/satd.db ./copia-satd.db                        # copia
docker compose cp ./copia-satd.db satd:/app/datos/satd.db && docker compose restart satd   # restaurar
```

## Desarrollo local

```bash
cd backend  && py -m pip install numpy pandas fastapi uvicorn tzdata && py -m uvicorn main:app --reload --port 8000
cd frontend && npm install && npm run dev        # http://localhost:5173
```

## Estructura

```
Sistema/      Modelo: simulador.py (simulación de 3 días), sugerencias.py y planes.py (generador de planes completos)
backend/      Servidor FastAPI (main.py) y base de datos SQLite (db.py); sirve también la web compilada
frontend/     Web en React + Vite + Tailwind
Datos/        Entradas del modelo: mapa de zonas, tiempos, ingresos y escenarios de demanda
```

## Seguridad

- Toda la API exige sesión (cookie `HttpOnly`, 12 horas) salvo el inicio de sesión y el registro; la del administrador exige su rol.
- Contraseñas guardadas con PBKDF2 y sal; tras 5 intentos fallidos se bloquea el inicio de sesión unos minutos.

Más detalle técnico en [`LEEME_Interfaz.txt`](LEEME_Interfaz.txt).

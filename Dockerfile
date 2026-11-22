# Etapa 1: compilar el frontend
FROM node:22-alpine AS front
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Etapa 2: backend + frontend compilado
FROM python:3.12-slim
WORKDIR /app
# tzdata: zona horaria de España para la fecha de la noche (no depende del sistema)
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" numpy pandas tzdata
COPY Sistema/ Sistema/
COPY backend/ backend/
COPY Datos/Entradas_Modelo/ Datos/Entradas_Modelo/
COPY Datos/Escenarios_Demanda/ Datos/Escenarios_Demanda/
COPY Datos/Analisis_Demanda/od_proporciones_hora.csv Datos/Analisis_Demanda/od_proporciones_hora.csv
COPY --from=front /app/frontend/dist frontend/dist
# Base de datos (SQLite) fuera del código: se monta como volumen para que sobreviva al recrear el contenedor
ENV SATD_DATOS=/app/datos
RUN mkdir -p /app/datos
WORKDIR /app/backend
EXPOSE 8000
# Un solo proceso: la caché de planes vive en memoria
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

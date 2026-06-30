# SCAR — Sistema de Control de Actividades Realizadas

Monorepo con frontend Angular y backend Spring Boot para gestión de actividades, incidencias, tiempo y reportes.

## Estructura

| Carpeta | Descripción |
|---------|-------------|
| `frontend/` | Aplicación Angular 21 (SCAR UI) |
| `backend/` | API REST Spring Boot 3.4 + PostgreSQL |

## Requisitos

- Node.js 20+ y Yarn
- Java 25 y Maven
- Docker (opcional, para PostgreSQL)

## Inicio rápido

### Base de datos

```bash
docker compose up -d
```

### Backend

```bash
cd backend
mvn spring-boot:run
```

API en `http://localhost:8080`

### Frontend

```bash
cd frontend
npm install
npm start
```

UI en `http://localhost:4200`
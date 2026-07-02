# SCAR — Sistema de Control de Actividades Realizadas

Monorepo con frontend Angular y backend Spring Boot para gestión de actividades, incidencias, tiempo y reportes.

## Estructura

| Carpeta | Descripción |
|---------|-------------|
| `frontend/` | Aplicación Angular 21 (SCAR UI) |
| `backend/` | API REST Spring Boot 3.4 + PostgreSQL |

## Requisitos

- Node.js 20+
- Java 21+ y Maven
- PostgreSQL 16+ instalado en local (servicio en `localhost:5432`)
- pgAdmin (opcional, para inspeccionar la base de datos)

## Arranque rápido (3 pasos)

### 1. PostgreSQL local

Asegúrate de que el servicio **PostgreSQL 16** esté en ejecución en Windows. Debe escuchar en el puerto **5432**.

### 2. Configuración única (solo la primera vez)

Copia el archivo de entorno y pon la contraseña de tu usuario `postgres` local:

```powershell
copy dev\local.env.example dev\local.env
notepad dev\local.env
```

Cambia `DB_ADMIN_PASSWORD=CAMBIA_ESTO` por tu contraseña real. El backend usará eso **solo la primera vez** para crear automáticamente la base `scar` y el usuario `scar`.

### 3. Arrancar el sistema

Opción A — script (abre backend y frontend en ventanas separadas):

```powershell
.\start-dev.ps1
```

Opción B — desde VS Code / Cursor: **Terminal → Run Task → SCAR: Full Stack**

Opción C — manualmente en dos terminales:

```powershell
# Terminal 1
cd backend
mvn spring-boot:run

# Terminal 2
cd frontend
npm start
```

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:8080 |
| PostgreSQL | localhost:5432 / base `scar` |

Abre **pgAdmin** y conecta con:

| Campo | Valor |
|-------|-------|
| Host | `localhost` |
| Puerto | `5432` |
| Base | `scar` |
| Usuario | `scar` |
| Contraseña | `60465524` |

Para importar el servidor preconfigurado: en pgAdmin ve a **Tools → Import/Export Servers** e importa `dev/pgadmin-servers.json`.

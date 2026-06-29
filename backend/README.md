# SCAR API

Backend REST en **Spring Boot 3.4** + **PostgreSQL 16** para SCAR (incidencias, tiempo, usuarios, notificaciones y Gantt).

## Requisitos

- Java 21
- Maven 3.9+
- PostgreSQL 16 (Docker o instalación local)

## Base de datos

### Con Docker (desde la raíz del monorepo)

```bash
docker compose up -d
```

### Sin Docker (PostgreSQL local)

Crea la base y el usuario:

```sql
CREATE USER scar WITH PASSWORD 'scar123';
CREATE DATABASE scar OWNER scar;
```

La configuración por defecto está en `src/main/resources/application.yml`:

| Parámetro | Valor |
|-----------|-------|
| URL | `jdbc:postgresql://localhost:5432/scar` |
| Usuario | `scar` |
| Contraseña | `scar123` |

Flyway aplica automáticamente `V1__init_schema.sql` al arrancar.

## Ejecutar la API

```bash
mvn spring-boot:run
```

La API escucha en **http://localhost:8080**.

## Credenciales demo

Tras el seed (`DataInitializer`):

| Campo | Valor |
|-------|-------|
| Organización (slug) | `scar` |
| Usuario admin | `pcondori` |
| Contraseña | `admin123` |

Otros usuarios: `arios`, `lmendoza`, `svega` (misma contraseña).

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login JWT por organización |
| GET | `/api/auth/me` | Usuario autenticado |
| GET | `/api/work/bootstrap` | Proyectos, incidencias, miembros |
| CRUD | `/api/issues` | Incidencias |
| POST | `/api/issues/{id}/comments` | Comentarios (@menciones) |
| POST | `/api/issues/{id}/time` | Registro de tiempo |
| POST | `/api/time/timer/start\|stop` | Cronómetro |
| GET | `/api/gantt?projectId=` | Vista Gantt |
| GET | `/api/notifications` | Notificaciones |

Autenticación: header `Authorization: Bearer <token>`.

## Frontend

En `../frontend/src/environments/environment.ts`:

```ts
useApi: true,
apiUrl: 'http://localhost:8080',
```

Arranca el frontend con `yarn start` y entra en `/auth/login`.

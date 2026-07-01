# SCAR API

Backend REST en **Spring Boot 3.4** + **PostgreSQL 16** para SCAR (incidencias, tiempo, usuarios, notificaciones y Gantt).

## Requisitos

- Java 25
- Maven 3.9+
- PostgreSQL 16+ en local (servicio activo en `localhost:5432`)

## Base de datos

Crea la base y el usuario (desde la raíz del monorepo):

```bash
psql -U postgres -f scripts/init-local-db.sql
```

La configuración por defecto está en `src/main/resources/application.yml`:

| Parámetro | Valor |
|-----------|-------|
| URL | `jdbc:postgresql://localhost:5432/scar` |
| Usuario | `scar` |
| Contraseña | `60465524` |

Puedes sobreescribir host, puerto, nombre, usuario y contraseña con las variables de entorno `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.

Flyway aplica automáticamente las migraciones en `classpath:db/migration` al arrancar.

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

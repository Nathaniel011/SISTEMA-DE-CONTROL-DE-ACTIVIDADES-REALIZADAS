# Migraciones unificadas

Las migraciones V1–V15 se consolidaron en un único archivo:

`V1__init_schema.sql`

Incluye planificación Gantt (`start_date`, `end_date`, `issue_type`, `observations`).

## Si ya tenías la base con V2 aplicada

Si Flyway registra la versión `2` y eliminaste ese archivo al unificar:

```sql
DELETE FROM flyway_schema_history WHERE version = '2';
```

Las columnas `issue_type` y `observations` ya deben existir en `issues`.

## Si ya tenías la base de datos con las migraciones antiguas

Flyway no puede “rebajar” versiones automáticamente. Opciones:

### Desarrollo (recomendado)

```bash
# PostgreSQL — recrear esquema
psql -U scar -d scar -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cd backend
mvn spring-boot:run
```

O con Flyway clean (solo en dev):

```bash
mvn flyway:clean flyway:migrate
```

### Producción

No elimines migraciones ya aplicadas. En ese caso conserva el historial Flyway existente y aplica solo cambios nuevos como migraciones incrementales.

Los datos semilla (admin, tablero general, listas) los crea `DataInitializer` y `BoardListsNormalizer` al arrancar.

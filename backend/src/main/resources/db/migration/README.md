# Migraciones unificadas

Las migraciones V1–V15 se consolidaron en un único archivo:

`V1__init_schema.sql`

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

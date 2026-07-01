-- PostgreSQL local para SCAR
-- Ejecutar como superusuario, por ejemplo:
--   psql -U postgres -f scripts/init-local-db.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'scar') THEN
    CREATE USER scar WITH PASSWORD '60465524';
  END IF;
END
$$;

SELECT 'CREATE DATABASE scar OWNER scar'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'scar')\gexec

GRANT ALL PRIVILEGES ON DATABASE scar TO scar;

-- PostgreSQL local para SCAR
-- Ejecutar como superusuario, por ejemplo:
--   psql -U postgres -f scripts/init-local-db.sql

\set ON_ERROR_STOP on
\getenv scar_password DB_PASSWORD
\if :{?scar_password}
\else
  \echo 'Define DB_PASSWORD antes de ejecutar este script.'
  \quit 1
\endif
SELECT format('CREATE USER scar WITH PASSWORD %L', :'scar_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'scar')\gexec
SELECT 'CREATE DATABASE scar OWNER scar'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'scar')\gexec

GRANT ALL PRIVILEGES ON DATABASE scar TO scar;

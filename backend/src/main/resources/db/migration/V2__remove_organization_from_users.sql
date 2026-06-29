-- Eliminar la dependencia de organización de la tabla users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_fkey;
ALTER TABLE users DROP COLUMN IF EXISTS organization_id;

-- Actualizar las restricciones de unicidad
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_organization_id_email_key;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

-- Eliminar la tabla organizations ya que no se usará
DROP TABLE IF EXISTS organizations CASCADE;

-- Eliminar la columna organization_id de otras tablas que la referencian
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_organization_id_fkey;
ALTER TABLE projects DROP COLUMN IF EXISTS organization_id;

ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_organization_id_fkey;
ALTER TABLE labels DROP COLUMN IF EXISTS organization_id;

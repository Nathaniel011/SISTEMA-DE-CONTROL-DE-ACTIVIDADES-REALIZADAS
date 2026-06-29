-- Actualizar restricción de unicidad en projects
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_organization_id_key_code_key;
ALTER TABLE projects ADD CONSTRAINT projects_key_code_key UNIQUE (key_code);

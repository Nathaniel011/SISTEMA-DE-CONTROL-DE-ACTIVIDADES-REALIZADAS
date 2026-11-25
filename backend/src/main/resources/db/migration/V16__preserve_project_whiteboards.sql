ALTER TABLE whiteboards ADD COLUMN project_removed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE FUNCTION preserve_project_whiteboards() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE whiteboards
    SET project_removed = TRUE, updated_at = CURRENT_TIMESTAMP
    WHERE project_id = OLD.id;
    RETURN OLD;
END;
$$;

CREATE TRIGGER preserve_whiteboards_before_project_delete
BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION preserve_project_whiteboards();

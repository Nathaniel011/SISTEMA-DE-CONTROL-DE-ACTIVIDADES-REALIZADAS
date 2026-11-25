ALTER TABLE knowledge_articles ADD COLUMN project_removed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE FUNCTION archive_project_knowledge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE knowledge_articles
    SET project_removed = TRUE, status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE project_id = OLD.id;
    RETURN OLD;
END;
$$;

CREATE TRIGGER archive_knowledge_before_project_delete
BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION archive_project_knowledge();

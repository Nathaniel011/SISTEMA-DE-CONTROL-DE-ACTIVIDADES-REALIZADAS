CREATE TABLE project_issue_fields (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    name_key VARCHAR(240) NOT NULL,
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('text', 'integer', 'date', 'booleanValue', 'enumeration')),
    options JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(options) = 'array'),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (project_id, name_key)
);

CREATE TABLE issue_field_values (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES project_issue_fields(id) ON DELETE CASCADE,
    field_value VARCHAR(500) NOT NULL,
    PRIMARY KEY (issue_id, field_id)
);

CREATE INDEX idx_issue_field_values_definition ON issue_field_values(field_id);

CREATE TABLE project_workflows (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    transitions JSONB NOT NULL CHECK (jsonb_typeof(transitions) = 'array')
);

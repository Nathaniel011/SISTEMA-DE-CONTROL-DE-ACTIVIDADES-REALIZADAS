CREATE TABLE agile_boards (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    name_key VARCHAR(240) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_id, name_key)
);

CREATE TABLE agile_board_projects (
    board_id UUID NOT NULL REFERENCES agile_boards(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (board_id, project_id)
);

CREATE INDEX idx_agile_board_project ON agile_board_projects(project_id);

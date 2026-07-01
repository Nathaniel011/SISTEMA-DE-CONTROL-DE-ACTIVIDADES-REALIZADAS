-- Create board_lists table first
CREATE TABLE board_lists (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_board_lists_project FOREIGN KEY (project_id) 
        REFERENCES projects(id) ON DELETE CASCADE
);

-- Create index for board_lists
CREATE INDEX idx_board_lists_project_id ON board_lists(project_id);
CREATE INDEX idx_board_lists_sort_order ON board_lists(sort_order);

-- Add tracking fields to issues table
ALTER TABLE issues ADD COLUMN assigned_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE issues ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE issues ADD COLUMN board_list_id UUID;

-- Add foreign key for board_list_id (after board_lists table exists)
ALTER TABLE issues ADD CONSTRAINT fk_issues_board_list 
    FOREIGN KEY (board_list_id) REFERENCES board_lists(id) ON DELETE SET NULL;

-- Add type column to projects table
ALTER TABLE projects ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'STANDARD';

-- Note: user_roles are stored as strings in user_roles table, not as a PostgreSQL enum type
-- The Java enum values are mapped to strings by Hibernate, so no schema change needed

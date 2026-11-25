ALTER TABLE issues ADD COLUMN gantt_pinned BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE issues SET gantt_pinned = TRUE WHERE start_date IS NOT NULL;

CREATE TABLE gantt_plans (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    capacity INTEGER CHECK (capacity BETWEEN 1 AND 100),
    assignee_capacity INTEGER CHECK (assignee_capacity BETWEEN 1 AND 100),
    workdays_only BOOLEAN NOT NULL,
    sync_issue_dates BOOLEAN NOT NULL,
    shared BOOLEAN NOT NULL
);

CREATE INDEX idx_gantt_plans_owner ON gantt_plans(owner_id);

CREATE TABLE gantt_plan_projects (
    plan_id UUID NOT NULL REFERENCES gantt_plans(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, project_id)
);

CREATE INDEX idx_gantt_plan_projects_project ON gantt_plan_projects(project_id);

CREATE TABLE gantt_plan_items (
    plan_id UUID NOT NULL REFERENCES gantt_plans(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    start_date DATE,
    end_date DATE,
    estimate_minutes INTEGER CHECK (estimate_minutes >= 0),
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (start_date IS NULL AND end_date IS NULL OR start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date),
    PRIMARY KEY (plan_id, issue_id)
);

CREATE INDEX idx_gantt_plan_items_issue ON gantt_plan_items(issue_id);

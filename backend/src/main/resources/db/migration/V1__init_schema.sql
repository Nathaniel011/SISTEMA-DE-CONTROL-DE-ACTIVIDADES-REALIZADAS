CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    username         VARCHAR(100) NOT NULL,
    email            VARCHAR(255) NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    full_name        VARCHAR(255) NOT NULL,
    initials         VARCHAR(10),
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, username),
    UNIQUE (organization_id, email)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role    VARCHAR(50) NOT NULL,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE projects (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    key_code         VARCHAR(10) NOT NULL,
    name             VARCHAR(255) NOT NULL,
    description      TEXT,
    accent           VARCHAR(50) NOT NULL DEFAULT 'bg-teal-500',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, key_code)
);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE labels (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id),
    name             VARCHAR(100) NOT NULL,
    color            VARCHAR(20) NOT NULL
);

CREATE TABLE issues (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_number     INT NOT NULL,
    type             VARCHAR(20) NOT NULL,
    column_id        VARCHAR(20) NOT NULL,
    title            VARCHAR(500) NOT NULL,
    description      TEXT,
    priority         VARCHAR(20) NOT NULL DEFAULT 'medium',
    assignee_id      UUID REFERENCES users(id),
    due_date         DATE,
    estimate_minutes INT,
    tracked_minutes  INT NOT NULL DEFAULT 0,
    sort_order       INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, issue_number)
);

CREATE TABLE issue_labels (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE issue_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id),
    text       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE time_entries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    minutes    INT NOT NULL CHECK (minutes > 0),
    note       TEXT,
    logged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE active_timers (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    note       TEXT
);

CREATE TABLE issue_dependencies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id            UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    depends_on_issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    dependency_type     VARCHAR(30) NOT NULL DEFAULT 'FINISH_TO_START',
    CONSTRAINT chk_no_self_dependency CHECK (issue_id <> depends_on_issue_id),
    UNIQUE (issue_id, depends_on_issue_id)
);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,
    title      VARCHAR(255) NOT NULL,
    message    TEXT,
    issue_id   UUID REFERENCES issues(id) ON DELETE SET NULL,
    read_flag  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issues_project ON issues(project_id);
CREATE INDEX idx_issues_assignee ON issues(assignee_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_flag);
CREATE INDEX idx_time_entries_issue ON time_entries(issue_id);

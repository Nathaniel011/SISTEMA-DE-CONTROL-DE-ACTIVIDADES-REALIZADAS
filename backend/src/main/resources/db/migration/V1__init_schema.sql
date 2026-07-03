-- Esquema unificado SCAR (reemplaza V1–V15). Para bases existentes: flyway clean + migrate o recrear DB.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(100) NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    initials      VARCHAR(10),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role    VARCHAR(50) NOT NULL,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE projects (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_code          VARCHAR(10) NOT NULL UNIQUE,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    accent            VARCHAR(50) NOT NULL DEFAULT 'bg-teal-500',
    type              VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    parent_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE board_lists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE issues (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_issue_id   UUID REFERENCES issues(id) ON DELETE SET NULL,
    board_list_id     UUID REFERENCES board_lists(id) ON DELETE SET NULL,
    created_by_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    issue_number      INT NOT NULL,
    column_id         VARCHAR(20) NOT NULL,
    title             VARCHAR(500) NOT NULL,
    description       TEXT,
    priority          VARCHAR(20) NOT NULL DEFAULT 'medium',
    assignee_id       UUID REFERENCES users(id),
    due_date          DATE,
    estimate_minutes  INT,
    tracked_minutes   INT NOT NULL DEFAULT 0,
    sort_order        INT NOT NULL DEFAULT 0,
    requester_name    VARCHAR(255),
    requester_phone   VARCHAR(50),
    requester_email   VARCHAR(255),
    reception_channel VARCHAR(50) DEFAULT 'manual',
    public_token      UUID DEFAULT gen_random_uuid(),
    start_date        DATE,
    end_date          DATE,
    issue_type        VARCHAR(30) DEFAULT 'FEATURE',
    observations      TEXT,
    assigned_at       TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, issue_number),
    CONSTRAINT issues_column_id_check CHECK (
        column_id IN ('registered', 'in_assignment', 'backlog', 'todo', 'in_progress', 'review', 'done', 'closed')
    )
);

CREATE TABLE issue_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id),
    text       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE time_entries (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id  UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id),
    minutes   INT NOT NULL CHECK (minutes > 0),
    note      TEXT,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE activity_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    action     VARCHAR(100) NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge_articles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
    title         VARCHAR(255) NOT NULL,
    slug          VARCHAR(320) NOT NULL UNIQUE,
    content       TEXT,
    tags          TEXT,
    status        VARCHAR(30) NOT NULL DEFAULT 'draft',
    author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE whiteboards (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    content_json  TEXT NOT NULL DEFAULT '{"elements":[]}',
    updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id    UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    file_name   VARCHAR(255) NOT NULL,
    file_url    VARCHAR(500) NOT NULL,
    mime_type   VARCHAR(100) NOT NULL,
    file_size   BIGINT NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_issues_project ON issues(project_id);
CREATE INDEX idx_issues_assignee ON issues(assignee_id);
CREATE INDEX idx_issues_board_list ON issues(board_list_id);
CREATE INDEX idx_issues_project_board_list ON issues(project_id, board_list_id);
CREATE INDEX idx_issues_project_column ON issues(project_id, column_id, sort_order);
CREATE INDEX idx_issues_priority_column ON issues(priority, column_id) WHERE column_id NOT IN ('done', 'closed');
CREATE INDEX idx_issues_parent ON issues(parent_issue_id);
CREATE INDEX idx_issues_created_by ON issues(created_by_id);
CREATE UNIQUE INDEX idx_issues_public_token ON issues(public_token) WHERE public_token IS NOT NULL;

CREATE INDEX idx_board_lists_project ON board_lists(project_id);
CREATE INDEX idx_board_lists_sort ON board_lists(sort_order);

CREATE INDEX idx_notifications_user ON notifications(user_id, read_flag);
CREATE INDEX idx_time_entries_issue ON time_entries(issue_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_logged_at ON time_entries(logged_at DESC);
CREATE INDEX idx_active_timers_user ON active_timers(user_id);
CREATE INDEX idx_comments_issue ON issue_comments(issue_id);
CREATE INDEX idx_users_active ON users(active) WHERE active = TRUE;
CREATE INDEX idx_attachments_issue ON attachments(issue_id);
CREATE INDEX idx_knowledge_articles_project ON knowledge_articles(project_id);
CREATE INDEX idx_whiteboards_project ON whiteboards(project_id);
CREATE INDEX idx_activity_log_issue ON activity_log(issue_id);

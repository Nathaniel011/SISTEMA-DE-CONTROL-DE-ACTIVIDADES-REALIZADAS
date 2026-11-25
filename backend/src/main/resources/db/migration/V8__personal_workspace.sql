CREATE TABLE personal_work_items (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(8) NOT NULL CHECK (kind IN ('capture', 'focus')),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((kind = 'capture' AND start_at IS NULL AND end_at IS NULL)
        OR (kind = 'focus' AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at))
);

CREATE INDEX idx_personal_work_owner ON personal_work_items (owner_id, kind, start_at);
CREATE INDEX idx_personal_work_issue ON personal_work_items (issue_id) WHERE issue_id IS NOT NULL;

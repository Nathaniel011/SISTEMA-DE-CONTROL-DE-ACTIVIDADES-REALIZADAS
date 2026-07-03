CREATE TABLE user_preferences (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_issue_filter VARCHAR(30) NOT NULL DEFAULT 'all',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

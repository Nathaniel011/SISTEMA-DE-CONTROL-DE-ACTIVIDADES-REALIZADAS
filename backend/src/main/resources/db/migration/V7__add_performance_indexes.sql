-- Performance indexes for common queries (only indexes not created in earlier migrations)
CREATE INDEX IF NOT EXISTS idx_issues_project_column ON issues(project_id, column_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_issues_priority_column ON issues(priority, column_id) WHERE column_id NOT IN ('done', 'closed');
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_logged_at ON time_entries(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_timers_user ON active_timers(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active) WHERE active = true;

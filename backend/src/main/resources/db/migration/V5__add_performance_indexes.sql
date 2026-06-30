-- Performance indexes for common queries
CREATE INDEX idx_issues_project_column ON issues(project_id, column_id, sort_order);
CREATE INDEX idx_issues_assignee ON issues(assignee_id);
CREATE INDEX idx_issues_public_token ON issues(public_token);
CREATE INDEX idx_issues_priority_column ON issues(priority, column_id) WHERE column_id NOT IN ('done', 'closed');
CREATE INDEX idx_time_entries_issue ON time_entries(issue_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_logged_at ON time_entries(logged_at DESC);
CREATE INDEX idx_active_timers_user ON active_timers(user_id);
CREATE INDEX idx_comments_issue ON comments(issue_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX idx_users_active ON users(active) WHERE active = true;

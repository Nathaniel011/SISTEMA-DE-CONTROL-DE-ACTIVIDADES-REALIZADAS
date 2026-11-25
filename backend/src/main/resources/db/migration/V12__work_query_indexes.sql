CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_issues_recent_page
    ON issues (updated_at DESC, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_issues_project_recent
    ON issues (project_id, updated_at DESC, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_issues_open_due
    ON issues (due_date, project_id) WHERE due_date IS NOT NULL AND column_id NOT IN ('done', 'closed');
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_project_members_user
    ON project_members (user_id, project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_issue_comments_author
    ON issue_comments (issue_id, author_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_issue_activity_recent
    ON activity_log (issue_id, created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scar_notification_recent
    ON notifications (user_id, created_at DESC, id DESC);

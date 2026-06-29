-- Add new issue states to the column_id check constraint
-- Since PostgreSQL doesn't support ALTER TYPE for ENUMs used in CHECK constraints,
-- we need to recreate the constraint

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_column_id_check;
ALTER TABLE issues ADD CONSTRAINT issues_column_id_check 
    CHECK (column_id IN ('registered', 'in_assignment', 'backlog', 'todo', 'in_progress', 'review', 'done', 'closed'));

-- Add contact fields for secretary workflow
ALTER TABLE issues ADD COLUMN IF NOT EXISTS requester_name VARCHAR(255);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS requester_phone VARCHAR(50);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS requester_email VARCHAR(255);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS reception_channel VARCHAR(50) DEFAULT 'manual';

-- Add public token for tracking link
ALTER TABLE issues ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_public_token ON issues(public_token) WHERE public_token IS NOT NULL;

-- Add start_date and end_date for Gantt chart
ALTER TABLE issues ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add activity log table for tracking status changes
CREATE TABLE IF NOT EXISTS activity_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    action     VARCHAR(100) NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_issue ON activity_log(issue_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);

ALTER TABLE work_jobs DROP CONSTRAINT work_jobs_kind_check;
ALTER TABLE work_jobs ADD CONSTRAINT work_jobs_kind_check
    CHECK (kind IN ('GANTT_PLAN', 'GANTT_PROJECT', 'WEEKLY_EXPORT'));
ALTER TABLE work_jobs ADD COLUMN project_scope UUID;
ALTER TABLE work_jobs ADD COLUMN week_start DATE;
ALTER TABLE work_jobs ADD COLUMN result_file BYTEA;
ALTER TABLE work_jobs ADD COLUMN result_issue_ids UUID[];

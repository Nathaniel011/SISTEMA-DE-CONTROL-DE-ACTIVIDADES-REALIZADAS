CREATE TABLE work_jobs (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(28) NOT NULL CHECK (kind IN ('GANTT_PLAN', 'GANTT_PROJECT')),
    target_id UUID NOT NULL,
    status VARCHAR(12) NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_until TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    failure_status INTEGER
);

CREATE UNIQUE INDEX idx_work_jobs_single_active
    ON work_jobs (owner_id, kind, target_id) WHERE status IN ('queued', 'running');
CREATE INDEX idx_work_jobs_claim
    ON work_jobs (created_at, id) WHERE status IN ('queued', 'running');
CREATE INDEX idx_work_jobs_finished
    ON work_jobs (finished_at) WHERE finished_at IS NOT NULL;

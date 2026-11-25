ALTER TABLE issues
    ADD COLUMN helpdesk_request BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN public_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN submission_key UUID,
    ADD COLUMN first_public_reply_at TIMESTAMPTZ;

UPDATE issues SET helpdesk_request = TRUE
WHERE column_id = 'registered'
   OR lower(trim(reception_channel)) IN ('oficina', 'telefono', 'web', 'email', 'correo');

CREATE UNIQUE INDEX idx_helpdesk_submission_key ON issues(submission_key) WHERE submission_key IS NOT NULL;

ALTER TABLE issue_comments ADD COLUMN public_reply BOOLEAN NOT NULL DEFAULT FALSE;

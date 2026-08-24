-- Run this in pgAdmin Query Tool on your assethub database.
-- Two-stage return approval: Department Head approves first, then Manager
-- gives final approval before the return is executed.
--
-- NOTE: server/index.js also applies these same statements automatically
-- on every server restart (idempotent, self-healing) — this file exists
-- for documentation parity and as a manual fallback.

ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS dept_head_email VARCHAR(255);
ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS dept_head_approved_at TIMESTAMP;
ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS approval_stage VARCHAR(20) DEFAULT 'dept_head';

-- Backfill: returns already pending before this shipped only ever
-- had one approver (today's manager_email) — skip them straight to the final stage.
UPDATE transfer_returns SET approval_stage='manager' WHERE approval_stage='dept_head' AND dept_head_email IS NULL;

-- Verify
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'transfer_returns' ORDER BY ordinal_position;

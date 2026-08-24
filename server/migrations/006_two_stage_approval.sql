-- Run this in pgAdmin Query Tool on your assethub database.
-- Two-stage transfer approval: Department Head approves first, then Manager
-- gives final approval before the transfer moves to "In Transit."
--
-- NOTE: server/index.js also applies these same statements automatically
-- on every server restart (idempotent, self-healing) — this file exists
-- for documentation parity with 002-005 and as a manual fallback.

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS dept_head_email VARCHAR(255);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS dept_head_approved_at TIMESTAMP;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS approval_stage VARCHAR(20) DEFAULT 'dept_head';
ALTER TABLE email_masters ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'Manager';

-- Backfill: transfers already Pending Approval before this shipped only ever
-- had one approver (today's manager_email) — skip them straight to the final stage.
UPDATE transfers SET approval_stage='manager' WHERE approval_stage='dept_head' AND dept_head_email IS NULL;

-- Verify
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'transfers'::regclass;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name IN ('transfers','email_masters') ORDER BY table_name, ordinal_position;

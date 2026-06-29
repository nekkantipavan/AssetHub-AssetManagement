-- Run this in pgAdmin Query Tool on your assethub database.
-- Asset Identity & Bulk Import Redesign — adds parent/child structure,
-- new required fields, drops model, and extends asset_masters for Cost Center.
--
-- IMPORTANT — run in two steps:
--   STEP 1: safe to run now against production (old code keeps working)
--   STEP 2: run at the same time you deploy the updated server code


-- ════════════════════════════════════════════════════════════
-- STEP 1 — Run now (backward-compatible with old code)
-- ════════════════════════════════════════════════════════════

-- 1a. New columns on assets (all nullable or have a safe default)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS parent_asset_id      INTEGER REFERENCES assets(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_sequence         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS company_code         VARCHAR(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cost_center          VARCHAR(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS reference_invoice_no VARCHAR(100);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS fiscal_year          VARCHAR(10);

-- 1b. Extend asset_masters to support a description attribute.
--     Used by the cost_center type only; all other types leave it NULL.
ALTER TABLE asset_masters ADD COLUMN IF NOT EXISTS description TEXT;

-- 1c. Pre-flight: check for duplicate asset_codes before adding unique constraint.
--     All existing rows carry sub_sequence = 0 (the default just applied),
--     so any duplicate asset_code would violate the constraint below.
--     This block raises an error with the count if duplicates exist;
--     raises a notice and proceeds if the data is clean.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT asset_code
    FROM assets
    GROUP BY asset_code
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add unique constraint: % asset_code value(s) appear more than once. '
      'Run this query to see them: '
      'SELECT asset_code, COUNT(*) FROM assets GROUP BY asset_code HAVING COUNT(*) > 1;',
      dup_count;
  ELSE
    RAISE NOTICE 'No duplicate asset_codes found — safe to add unique constraint.';
  END IF;
END $$;

-- 1d. Unique constraint on (asset_code, sub_sequence)
--     Only reached if the pre-flight above passes.
ALTER TABLE assets ADD CONSTRAINT uq_asset_code_sub UNIQUE (asset_code, sub_sequence);


-- ════════════════════════════════════════════════════════════
-- STEP 2 — Run together with the updated server code deployment
--           DO NOT run this while the old server code is live.
-- ════════════════════════════════════════════════════════════

-- 2a. Drop model column (data loss confirmed intentional)
-- ALTER TABLE assets DROP COLUMN IF EXISTS model;


-- ════════════════════════════════════════════════════════════
-- Verify — run after either step to confirm schema state
-- ════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'assets'
  AND column_name IN (
    'parent_asset_id', 'sub_sequence', 'company_code',
    'cost_center', 'reference_invoice_no', 'fiscal_year', 'model'
  )
ORDER BY column_name;

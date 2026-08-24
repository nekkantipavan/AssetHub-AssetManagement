-- ============================================================================
--  AssetHub — DEPARTMENT CONSTRAINT MIGRATION SCRIPT
-- ============================================================================
--  Description:
--  This script removes the strict single-column unique constraint on `code` in the `departments` table.
--  It replaces it with a composite unique index on (Name + Code + Plant).
--
--  Effect:
--  - Allows different departments (e.g., Equipment vs Maintenance) to share codes or plants.
--  - Allows the same department name (e.g., Equipment) to exist with different codes or across plants.
--  - Prevents exact duplicate entries where Name, Code, AND Plant are identical.
--
--  Usage:
--  Run this SQL script manually in pgAdmin Query Tool or via psql command line on your target database.
-- ============================================================================

BEGIN;

-- STEP 1: (Optional Pre-check) Check if any existing rows in production violate the new composite index
-- SELECT LOWER(TRIM(name)), LOWER(TRIM(code)), COALESCE(plant_id, -1), COUNT(*)
-- FROM departments
-- GROUP BY LOWER(TRIM(name)), LOWER(TRIM(code)), COALESCE(plant_id, -1)
-- HAVING COUNT(*) > 1;

-- STEP 2: Drop the legacy strict unique constraint on `code` if present
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_code_key;

-- STEP 3: Drop any existing index associated with the old constraint
DROP INDEX IF EXISTS departments_code_key;

-- STEP 4: Create the new composite unique index (Name + Code + Plant)
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_code_plant_unique_idx 
ON departments (LOWER(TRIM(name)), LOWER(TRIM(code)), COALESCE(plant_id, -1));

COMMIT;

-- ============================================================================
--  Verification Query: Run after script completes to confirm the index exists
-- ============================================================================
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'departments';

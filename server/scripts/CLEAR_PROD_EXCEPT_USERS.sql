-- ============================================================================
--  AssetHub — PRODUCTION DATA WIPE (EXCEPT USERS)
-- ============================================================================
--  ⚠️ WARNING: THIS PERMANENTLY DELETES ALL DATA IN ALL TABLES EXCEPT 'users'.
--  THIS ACTION IS IRREVERSIBLE.
--
--  STEP 1: TAKE A FULL DATABASE BACKUP FIRST!
--  Run this command on your production server command line:
--      pg_dump -U postgres -h localhost assethub > assethub_backup_before_wipe_$(date +%Y%m%d_%H%M%S).sql
--
--  STEP 2: RUN THIS SCRIPT IN pgAdmin QUERY TOOL (or psql) CONNECTED TO PRODUCTION DB
-- ============================================================================

BEGIN;

-- Temporarily disable foreign key trigger checks so CASCADE does not follow foreign keys to 'users'
SET session_replication_role = 'replica';

-- Dynamic wipe of ALL public tables EXCEPT 'users' (safety guarantee)
DO $$
DECLARE
    rec RECORD;
    cmd TEXT;
BEGIN
    FOR rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('users', 'spatial_ref_sys')
    LOOP
        cmd := 'DELETE FROM ' || quote_ident(rec.table_name) || ';';
        RAISE NOTICE 'Deleting rows from table: %', rec.table_name;
        EXECUTE cmd;
    END LOOP;

    -- Reset sequences for wiped tables
    FOR rec IN
        SELECT s.relname AS seq_name
        FROM pg_class s
        JOIN pg_depend d ON d.objid = s.oid
        JOIN pg_class t ON t.oid = d.refobjid
        WHERE s.relkind = 'S'
          AND t.relname NOT IN ('users', 'spatial_ref_sys')
    LOOP
        cmd := 'ALTER SEQUENCE ' || quote_ident(rec.seq_name) || ' RESTART WITH 1;';
        RAISE NOTICE 'Resetting sequence: %', rec.seq_name;
        EXECUTE cmd;
    END LOOP;
END $$;

-- Restore normal foreign key constraint checks
SET session_replication_role = 'origin';

COMMIT;

-- ============================================================================
-- AFTER RUNNING:
-- 1. Restart the API server so role permissions & default settings re-seed:
--        pm2 restart assethub-api
-- 2. All user logins, passwords, roles, and employee IDs remain intact.
-- ============================================================================

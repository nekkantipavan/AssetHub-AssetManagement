-- ============================================================================
--  AssetHub — FULL DATA RESET  (fresh handover to a new customer)
-- ============================================================================
--  ⚠️  THIS PERMANENTLY DELETES ALL DATA. THERE IS NO UNDO.
--
--  BEFORE YOU RUN THIS, TAKE A BACKUP (from a shell on the production server):
--      pg_dump -U postgres -h localhost assethub > assethub_backup_YYYYMMDD.sql
--
--  It keeps the table STRUCTURE and wipes every row, resets all id counters to 1,
--  and creates ONE fresh Admin login so you're not locked out.
--
--  Run it in pgAdmin → Query Tool, connected to the `assethub` database on the
--  PRODUCTION server. Then restart the API:   pm2 restart assethub-api
--  (the restart re-seeds the default Manager/User role permissions automatically).
-- ============================================================================

BEGIN;

-- 1) Wipe every data table. RESTART IDENTITY resets id sequences back to 1,
--    CASCADE clears foreign-key children in the right order.
--    ── To KEEP your master data (plants / departments / asset & email masters),
--       delete those four names from this list before running. ──
TRUNCATE TABLE
    audit_logs,
    notifications,
    return_items,
    transfer_returns,
    transfer_items,
    transfers,
    asset_request_items,
    asset_requests,
    assets,
    challan_sequences,
    challan_settings,
    email_masters,
    asset_masters,
    departments,
    plants,
    role_permissions,
    users
RESTART IDENTITY CASCADE;

-- 2) Create one fresh Admin so you can log in after the wipe.
--    ✏️  EDIT the name / email / username below to suit the customer.
--    Login  → username: admin   password: Admin@123
--    (must_change_password = true forces a new password at first login.)
INSERT INTO users (employee_id, username, name, email, password_hash, role, status, must_change_password, created_at)
VALUES (
    'ADMIN001',
    'admin',
    'Administrator',
    'admin@yourcompany.com',
    '$2b$10$m3fAniMdUQ3rpFj6KYp9HucP7uO3QkA5XcgqSJyyzgavQG1QsdOoq',  -- bcrypt of "Admin@123"
    'Admin',
    'Active',
    true,
    NOW()
);

COMMIT;

-- ============================================================================
--  AFTER RUNNING:
--    1.  pm2 restart assethub-api        (re-seeds role permissions + default
--                                          challan settings row)
--    2.  Log in as admin / Admin@123 and change the password when prompted.
--    3.  The customer sets up their own Plants (with challan prefixes),
--        Departments, Asset & Email Masters, and Users.
-- ============================================================================

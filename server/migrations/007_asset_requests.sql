-- Run this in pgAdmin Query Tool on your assethub database.
-- Asset Request page: users submit asset requests (with one or more line items)
-- that flow through a 3-stage approval — Department Head (email) → Asset Team
-- assigns one code per line item (in-app) → Manager (email) → Approved.
-- Rejection at either email stage rejects the whole request.
--
-- NOTE: server/index.js also creates/repairs these tables automatically on every
-- server restart (idempotent, self-healing) — this file exists for documentation
-- parity with 002-006 and as a manual fallback.

CREATE TABLE IF NOT EXISTS asset_requests (
  id                     SERIAL PRIMARY KEY,
  request_code           VARCHAR(40) UNIQUE NOT NULL,
  requested_by           INTEGER REFERENCES users(id),
  asset_owner            VARCHAR(255),
  dept_id                INTEGER REFERENCES departments(id),
  total_amount           NUMERIC,
  status                 VARCHAR(30) NOT NULL DEFAULT 'Pending Dept Head',
  dept_head_email        VARCHAR(255),
  manager_email          VARCHAR(255),
  approval_token         VARCHAR(255),
  approval_token_expires TIMESTAMP,
  dept_head_approved_at  TIMESTAMP,
  manager_approved_at    TIMESTAMP,
  rejected_reason        TEXT,
  rejected_stage         VARCHAR(30),
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_request_items (
  id                   SERIAL PRIMARY KEY,
  request_id           INTEGER REFERENCES asset_requests(id) ON DELETE CASCADE,
  seq                  INTEGER NOT NULL,
  material_description TEXT NOT NULL,
  quantity             INTEGER NOT NULL,
  unit_price           NUMERIC,
  total_amount         NUMERIC,
  company_code         VARCHAR(50),
  cost_center          VARCHAR(50),
  project_name         VARCHAR(255),
  plant_id             INTEGER REFERENCES plants(id),
  asset_life           INTEGER,
  remarks              TEXT,
  asset_code           VARCHAR(100),   -- one code per line item, assigned in the middle step
  created_at           TIMESTAMP DEFAULT NOW()
);

-- If upgrading from the earlier single-item shape, drop the old per-item columns
-- and the old codes table (safe no-ops if they never existed):
ALTER TABLE asset_requests DROP COLUMN IF EXISTS material_description;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS quantity;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS unit_price;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS company_code;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS cost_center;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS project_name;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS plant_id;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS asset_life;
ALTER TABLE asset_requests DROP COLUMN IF EXISTS remarks;
DROP TABLE IF EXISTS asset_request_codes;

-- Page permissions for the new page (Admin is always full via code).
INSERT INTO role_permissions (role, page, access) VALUES
  ('Manager','asset-requests','true'),
  ('User','asset-requests','true')
ON CONFLICT (role, page) DO NOTHING;

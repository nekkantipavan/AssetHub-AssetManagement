-- Run this in pgAdmin Query Tool on your assethub database.
-- Plant-based delivery/return challan numbering: {PREFIX}-AST-{FY}-{seq}
-- e.g. NSPL-AST-2627-001, and returns as {PREFIX}-RET-{FY}-{seq}.
-- PREFIX comes from the plant selected as FROM (delivery) / the returning
-- plant (return) — see plants.challan_prefix. FY is the short fiscal year
-- (Apr-Mar), e.g. 2627 for FY2026-27. Sequence resets per prefix+FY+doc_type.
--
-- NOTE: server/index.js also creates/repairs these on every server restart
-- (idempotent, self-healing) — this file exists for documentation parity
-- with 002-007 and as a manual fallback.

ALTER TABLE plants ADD COLUMN IF NOT EXISTS challan_prefix VARCHAR(20);

CREATE TABLE IF NOT EXISTS challan_sequences (
  prefix      VARCHAR(20) NOT NULL,
  fiscal_year VARCHAR(4)  NOT NULL,
  doc_type    VARCHAR(20) NOT NULL,
  last_seq    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, fiscal_year, doc_type)
);

CREATE TABLE IF NOT EXISTS challan_settings (
  id                SMALLINT PRIMARY KEY DEFAULT 1,
  delivery_doc_type VARCHAR(20)  NOT NULL DEFAULT 'AST',
  return_doc_type   VARCHAR(20)  NOT NULL DEFAULT 'RET',
  seq_padding       SMALLINT     NOT NULL DEFAULT 3,
  footer_note       TEXT         NOT NULL DEFAULT 'Material transferred internally for business use only. Not intended for sale.',
  signatory_label   VARCHAR(100) NOT NULL DEFAULT 'AUTHORISED SIGNATORY',
  CHECK (id = 1)
);
-- Template-designer columns: master on/off switch, embedded signature image (data URI),
-- and a JSON blob for all visual customisations (labels, colours, logo, section toggles).
ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS template_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS signature_image  TEXT;
ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS template         JSONB NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO challan_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE transfers         ADD COLUMN IF NOT EXISTS challan_no VARCHAR(50);
ALTER TABLE transfer_returns  ADD COLUMN IF NOT EXISTS challan_no VARCHAR(50);

-- Page permission for the new Admin-only Challan Settings page.
-- (Admin already bypasses role_permissions entirely in code; this row is
-- only relevant if Manager/User access is ever intentionally granted.)
INSERT INTO role_permissions (role, page, access) VALUES
  ('Manager','challan-settings','false'),
  ('User','challan-settings','false')
ON CONFLICT (role, page) DO NOTHING;

-- Role Permissions: controls page-level access for Manager and User roles.
-- Admin always has full access and is NOT stored here.
CREATE TABLE IF NOT EXISTS role_permissions (
  id         SERIAL       PRIMARY KEY,
  role       VARCHAR(50)  NOT NULL,
  page       VARCHAR(100) NOT NULL,
  access     VARCHAR(10)  NOT NULL DEFAULT 'false',
  updated_at TIMESTAMP    DEFAULT NOW(),
  UNIQUE(role, page)
);

-- Seed defaults — matches previous hardcoded PAGE_PERMISSIONS values.
INSERT INTO role_permissions (role, page, access) VALUES
  ('Manager', 'dashboard',     'true' ),
  ('Manager', 'assets',        'true' ),
  ('Manager', 'bulk-upload',   'true' ),
  ('Manager', 'transfer',      'true' ),
  ('Manager', 'plants',        'view' ),
  ('Manager', 'departments',   'view' ),
  ('Manager', 'masters',       'view' ),
  ('Manager', 'email-masters', 'false'),
  ('Manager', 'reports',       'true' ),
  ('Manager', 'users',         'view' ),
  ('Manager', 'audit-logs',    'false'),
  ('User',    'dashboard',     'true' ),
  ('User',    'assets',        'view' ),
  ('User',    'bulk-upload',   'false'),
  ('User',    'transfer',      'view' ),
  ('User',    'plants',        'false'),
  ('User',    'departments',   'false'),
  ('User',    'masters',       'false'),
  ('User',    'email-masters', 'false'),
  ('User',    'reports',       'false'),
  ('User',    'users',         'false'),
  ('User',    'audit-logs',    'false')
ON CONFLICT (role, page) DO NOTHING;

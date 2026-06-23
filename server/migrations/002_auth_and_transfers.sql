-- Run this in pgAdmin Query Tool on your assethub database
-- It adds missing columns and creates the audit_logs / transfers tables safely

-- 1. Add last_login to users if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- 2. Add updated_at to plants if missing
ALTER TABLE plants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- 3. Transfers table
CREATE TABLE IF NOT EXISTS transfers (
  id             SERIAL PRIMARY KEY,
  transfer_code  VARCHAR(60) UNIQUE NOT NULL,
  asset_id       INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  from_plant_id  INTEGER REFERENCES plants(id) ON DELETE SET NULL,
  to_plant_id    INTEGER REFERENCES plants(id) ON DELETE SET NULL,
  transfer_type  VARCHAR(30) DEFAULT 'Returnable',
  status         VARCHAR(30) DEFAULT 'Pending',
  initiated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- 4. Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  action      VARCHAR(100) NOT NULL,
  module      VARCHAR(50),
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  details     TEXT,
  ip_address  VARCHAR(50),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- 5. Seed a default Admin user (password: admin123)
--    bcrypt hash for "admin123" with 10 rounds
INSERT INTO users (employee_id, name, email, password_hash, role, status, created_at)
VALUES (
  'EMP001',
  'Admin User',
  'admin@assethub.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: admin123
  'Admin',
  'Active',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

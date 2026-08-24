const express = require('express')
const cors    = require('cors')
const pool    = require('./db')
const bcrypt  = require('bcrypt')
const jwt     = require('jsonwebtoken')
require('dotenv').config()
const { sendHtml, buildApprovalEmail, buildReturnApprovalEmail, buildApprovalResultHtml, buildChallanTable, buildAssetRequestApprovalEmail } = require('./emailService')
const crypto = require('crypto')
const ASSET_FIELD_SPEC = require('./assetFieldSpec')

const app        = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Security headers (applied to every response) ─────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // HSTS only has effect over HTTPS; harmless over HTTP, ready for when TLS is enabled.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"
  )
  next()
})

// ── Response sanitizer: never leak secrets in any JSON response ──
// Strips approval tokens, password hashes, etc. from every response body
// (deep), so no current or future endpoint can expose them.
const SENSITIVE_KEYS = new Set([
  'approval_token', 'approval_token_expires', 'password_hash', 'password',
])
function stripSensitive(val) {
  if (Array.isArray(val)) return val.map(stripSensitive)
  if (val instanceof Date) return val
  if (val && typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEYS.has(k)) continue
      out[k] = stripSensitive(v)
    }
    return out
  }
  return val
}
app.use((req, res, next) => {
  const origJson = res.json.bind(res)
  res.json = body => origJson(stripSensitive(body))
  next()
})

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in the environment. Refusing to start with an insecure default.')
  process.exit(1)
}
const JWT_SECRET = process.env.JWT_SECRET
const PORT       = process.env.PORT || 3001

// ── Startup migration: role_permissions table ────────────────
;(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id         SERIAL       PRIMARY KEY,
        role       VARCHAR(50)  NOT NULL,
        page       VARCHAR(100) NOT NULL,
        access     VARCHAR(10)  NOT NULL DEFAULT 'false',
        updated_at TIMESTAMP    DEFAULT NOW(),
        UNIQUE(role, page)
      )
    `)
    const seed = [
      ['Manager','dashboard','true'],['Manager','assets','true'],['Manager','bulk-upload','true'],
      ['Manager','transfer','true'],['Manager','plants','view'],['Manager','departments','view'],
      ['Manager','masters','view'],['Manager','email-masters','false'],['Manager','reports','true'],
      ['Manager','users','view'],['Manager','audit-logs','false'],['Manager','asset-requests','true'],
      ['User','dashboard','true'],['User','assets','view'],['User','bulk-upload','false'],
      ['User','transfer','view'],['User','plants','false'],['User','departments','false'],
      ['User','masters','false'],['User','email-masters','false'],['User','reports','false'],
      ['User','users','false'],['User','audit-logs','false'],['User','asset-requests','true'],
    ]
    for (const [role, page, access] of seed) {
      await pool.query(
        `INSERT INTO role_permissions (role, page, access) VALUES ($1,$2,$3) ON CONFLICT (role, page) DO NOTHING`,
        [role, page, access]
      )
    }
    console.log('✓ role_permissions table ready')
  } catch (err) {
    console.error('Migration error:', err.message)
  }
})()

// ── Startup migration: upgrade any legacy plaintext passwords to bcrypt ─
;(async () => {
  try {
    // Column used to invalidate JWTs issued before a logout / password change.
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_invalid_before TIMESTAMP')
    const r = await pool.query(
      `SELECT id, password_hash FROM users WHERE password_hash NOT LIKE '$2%'`
    )
    for (const u of r.rows) {
      const hashed = await bcrypt.hash(u.password_hash, 10)
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashed, u.id])
    }
    if (r.rows.length) console.log(`✓ Migrated ${r.rows.length} legacy plaintext password(s) to bcrypt`)
  } catch (err) {
    console.error('Password migration error:', err.message)
  }
})()


app.use(cors({
  origin: [
    "http://localhost:8080",
    "http://192.168.109.92:8080",
    "http://192.168.24.15:8080"
  ],
  credentials: true
}));
 
// ── Auth middleware ──────────────────────────────────────────
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'No token provided' })
  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    // Reject tokens issued before a logout / password change (server-side invalidation)
    const u = await pool.query('SELECT token_invalid_before FROM users WHERE id=$1', [decoded.id])
    if (!u.rows.length) return res.status(401).json({ error: 'Invalid or expired token' })
    const inv = u.rows[0].token_invalid_before
    if (inv && decoded.iat && decoded.iat * 1000 < new Date(inv).getTime())
      return res.status(401).json({ error: 'Session expired, please log in again' })
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
 
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Insufficient permissions' })
    next()
  }
}

// Strip HTML tags from stored free-text so persisted values can't carry markup
// (defense-in-depth against stored XSS; React + email escaping are the primary controls).
function stripTags(s) {
  return s == null ? s : String(s).replace(/<[^>]*>/g, '').trim()
}

// Password complexity policy: ≥8 chars with upper, lower, digit, and symbol.
// Returns an error string if invalid, or null if the password passes.
function passwordPolicyError(pw) {
  if (!pw || pw.length < 8)      return 'Password must be at least 8 characters'
  if (!/[a-z]/.test(pw))         return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(pw))         return 'Password must include an uppercase letter'
  if (!/[0-9]/.test(pw))         return 'Password must include a number'
  if (!/[^A-Za-z0-9]/.test(pw))  return 'Password must include a symbol'
  return null
}

// Email validation + optional domain allowlist (ALLOWED_EMAIL_DOMAINS, comma-separated).
// Defaults to the organisation domain derived from SMTP_FROM_EMAIL/SMTP_USER.
function allowedEmailDomains() {
  const env = process.env.ALLOWED_EMAIL_DOMAINS
  if (env) return env.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
  const from = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ''
  const dom = from.split('@')[1]
  return dom ? [dom.toLowerCase()] : []
}
function emailError(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Invalid email address'
  const allowed = allowedEmailDomains()
  if (allowed.length === 0) return null            // not configured → format check only
  const dom = e.split('@')[1]
  if (!allowed.includes(dom)) return `Email domain must be one of: ${allowed.join(', ')}`
  return null
}

// ── Lightweight in-memory rate limiter (single pm2 process) ──
// Returns Express middleware allowing `max` requests per `windowMs` per key.
function rateLimit({ windowMs, max, keyFn }) {
  const hits = new Map()   // key → [timestamps]
  // Periodic cleanup so the map doesn't grow unbounded
  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [k, arr] of hits) {
      const kept = arr.filter(t => t > cutoff)
      if (kept.length) hits.set(k, kept); else hits.delete(k)
    }
  }, windowMs).unref?.()

  return (req, res, next) => {
    const now = Date.now(), cutoff = now - windowMs
    const key = (keyFn ? keyFn(req) : (req.ip || 'global'))
    const arr = (hits.get(key) || []).filter(t => t > cutoff)
    if (arr.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000))
      return res.status(429).json({ error: 'Too many requests — please try again later.' })
    }
    arr.push(now)
    hits.set(key, arr)
    next()
  }
}

// Login: 8 attempts / 15 min per IP+username. Admin/email ops: 30 / 5 min per IP.
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 8,
  keyFn: req => `${req.ip}|${String(req.body?.username || '').toLowerCase()}` })
const sensitiveLimiter = rateLimit({ windowMs: 5*60*1000, max: 30 })
 
// Ensure meta column and notifications table exist (idempotent)
pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS meta JSONB`).catch(() => {})
pool.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    type        VARCHAR(50),
    message     TEXT NOT NULL,
    related_code TEXT,
    related_id  INTEGER,
    is_read     BOOLEAN DEFAULT false,
    created_at  TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {})

// Ensure two-stage transfer approval columns exist (idempotent), and
// backfill in-flight transfers created before this feature shipped —
// they only ever had one approver, so they skip straight to the final stage.
// Sequential (awaited): the backfill UPDATE depends on the ADD COLUMNs above it.
;(async () => {
  try {
    await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS dept_head_email VARCHAR(255)`)
    await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS dept_head_approved_at TIMESTAMP`)
    await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS approval_stage VARCHAR(20) DEFAULT 'dept_head'`)
    await pool.query(`ALTER TABLE email_masters ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'Manager'`)
    await pool.query(`UPDATE transfers SET approval_stage='manager' WHERE approval_stage='dept_head' AND dept_head_email IS NULL`)
  } catch (err) {
    console.error('Two-stage approval migration error:', err.message)
  }
})()

// Ensure plant-based challan numbering exists (idempotent, self-healing on every boot).
// Each plant carries a short prefix (e.g. NSPL); challan_sequences holds an atomic
// per-prefix/fiscal-year/doc-type counter so concurrent creates never collide;
// challan_settings is a single-row table for the admin-configurable doc-type
// labels, sequence padding, and printed boilerplate text.
;(async () => {
  try {
    await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS challan_prefix VARCHAR(20)`)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS challan_sequences (
        prefix      VARCHAR(20) NOT NULL,
        fiscal_year VARCHAR(4)  NOT NULL,
        doc_type    VARCHAR(20) NOT NULL,
        last_seq    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (prefix, fiscal_year, doc_type)
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS challan_settings (
        id                SMALLINT PRIMARY KEY DEFAULT 1,
        delivery_doc_type VARCHAR(20)  NOT NULL DEFAULT 'AST',
        return_doc_type   VARCHAR(20)  NOT NULL DEFAULT 'RET',
        seq_padding       SMALLINT     NOT NULL DEFAULT 3,
        footer_note       TEXT         NOT NULL DEFAULT 'Material transferred internally for business use only. Not intended for sale.',
        signatory_label   VARCHAR(100) NOT NULL DEFAULT 'AUTHORISED SIGNATORY',
        CHECK (id = 1)
      )
    `)
    // Template-designer columns: master on/off switch, embedded signature image,
    // and a JSON blob for all visual customisations (labels, colours, logo, toggles).
    await pool.query(`ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS template_enabled BOOLEAN NOT NULL DEFAULT false`)
    await pool.query(`ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS signature_image TEXT`)
    await pool.query(`ALTER TABLE challan_settings ADD COLUMN IF NOT EXISTS template JSONB NOT NULL DEFAULT '{}'::jsonb`)
    await pool.query(`INSERT INTO challan_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
    await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS challan_no VARCHAR(50)`)
    await pool.query(`ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS challan_no VARCHAR(50)`)
  } catch (err) {
    console.error('Challan numbering migration error:', err.message)
  }
})()

// Ensure two-stage return approval columns exist (idempotent).
// Mirrors the transfer two-stage pattern: Dept Head approves first, then Manager.
// Backfill: returns created before this feature only had manager_email,
// so they skip straight to the final (manager) stage.
;(async () => {
  try {
    await pool.query(`ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS dept_head_email VARCHAR(255)`)
    await pool.query(`ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS dept_head_approved_at TIMESTAMP`)
    await pool.query(`ALTER TABLE transfer_returns ADD COLUMN IF NOT EXISTS approval_stage VARCHAR(20) DEFAULT 'dept_head'`)
    await pool.query(`UPDATE transfer_returns SET approval_stage='manager' WHERE approval_stage='dept_head' AND dept_head_email IS NULL`)
  } catch (err) {
    console.error('Two-stage return approval migration error:', err.message)
  }
})()

// Self-healing migration: sanitize existing email_masters names & departments in DB
;(async () => {
  try {
    await pool.query(`
      UPDATE email_masters
      SET name = REGEXP_REPLACE(name, '<[^>]*>', '', 'g'),
          department = REGEXP_REPLACE(department, '<[^>]*>', '', 'g')
      WHERE name LIKE '%<%' OR department LIKE '%<%'
    `)
  } catch (err) {
    console.error('Email masters cleanup migration error:', err.message)
  }
})()


// Ensure asset-request tables exist (idempotent, self-healing on every boot).
// A request holds shared fields; each line item lives in asset_request_items
// and gets exactly one asset_code.
;(async () => {
  try {
    await pool.query(`
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
      )
    `)
    // Migrate away from the original single-item shape (per-item cols on the request).
    for (const col of ['material_description','quantity','unit_price','company_code',
                       'cost_center','project_name','plant_id','asset_life','remarks']) {
      await pool.query(`ALTER TABLE asset_requests DROP COLUMN IF EXISTS ${col}`)
    }
    await pool.query(`ALTER TABLE asset_requests ADD COLUMN IF NOT EXISTS total_amount NUMERIC`)
    await pool.query(`DROP TABLE IF EXISTS asset_request_codes`)
    await pool.query(`
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
        asset_code           VARCHAR(100),
        created_at           TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('✓ asset_requests tables ready')
  } catch (err) {
    console.error('Asset requests migration error:', err.message)
  }
})()

async function createNotification(type, message, relatedCode, relatedId) {
  try {
    await pool.query(
      `INSERT INTO notifications (type, message, related_code, related_id) VALUES ($1,$2,$3,$4)`,
      [type, message, relatedCode, relatedId]
    )
  } catch { /* non-fatal */ }
}

async function writeAudit(userId, action, module, details, ip, meta = null) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, module, details, ip_address, created_at, meta)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6)`,
      [userId, action, module, details, ip, meta ? JSON.stringify(meta) : null]
    )
  } catch { /* non-fatal */ }
}
 
// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════
 
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required' })
 
    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1 AND status = 'Active'`,
      [username.trim()]
    )
 
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid username or password' })
 
    const user = result.rows[0]
 
    const valid = await bcrypt.compare(password, user.password_hash)
 
    if (!valid)
      return res.status(401).json({ error: 'Invalid username or password' })
 
    const token = jwt.sign(
      { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, must_change_password: user.must_change_password},
      JWT_SECRET,
      { expiresIn: '8h' }
    )
 
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])
    await writeAudit(user.id, 'Login', 'Auth', `${user.name} logged in`, req.ip)
 
    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, must_change_password: user.must_change_password}
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
 
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, employee_id, username, name, email, role, status FROM users WHERE id=$1',
      [req.user.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── Logout: invalidate all existing JWTs for this user ───────
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE users SET token_invalid_before = NOW() WHERE id=$1', [req.user.id])
    res.json({ message: 'Logged out' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body

    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Current and new password are required' })

    const pwErr = passwordPolicyError(new_password)
    if (pwErr) return res.status(400).json({ error: pwErr })

    // Fetch current hash
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!result.rows.length)
      return res.status(404).json({ error: 'User not found' })

    const user = result.rows[0]

    // Verify current password
    const valid = await bcrypt.compare(current_password, user.password_hash)

    if (!valid)
      return res.status(401).json({ error: 'Current password is incorrect' })

    // Hash new password, clear the force-change flag, and invalidate old sessions
    const hashed = await bcrypt.hash(new_password, 10)
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, token_invalid_before = NOW() WHERE id = $2',
      [hashed, req.user.id]
    )

    await writeAudit(req.user.id, 'Password Changed', 'Auth', `${user.name} changed their password`, req.ip)
    res.json({ message: 'Password changed successfully' })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Admin: reset another user's password ────────────────────
app.put('/api/users/:id/reset-password', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { new_password } = req.body

    const pwErr = passwordPolicyError(new_password)
    if (pwErr) return res.status(400).json({ error: pwErr })

    const hashed = await bcrypt.hash(new_password, 10)

    // Set new password, force change on next login, and invalidate old sessions
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = true, token_invalid_before = NOW()
       WHERE id = $2
       RETURNING id, name, username`,
      [hashed, id]
    )

    if (!result.rows.length)
      return res.status(404).json({ error: 'User not found' })

    await writeAudit(
      req.user.id, 'Password Reset', 'Users',
      `Admin reset password for user ${result.rows[0].name}`, req.ip
    )

    res.json({ message: `Password reset. ${result.rows[0].name} will be prompted to change it on next login.` })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── TEST SMTP CONNECTION (Admin only — for diagnostics) ────────────────
app.get('/api/test-smtp', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const connTest = await testConnection()
    res.json({
      connection: connTest,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('SMTP test error:', err.message)
    res.status(500).json({
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString()
    })
  }
})

// ── SEND TEST EMAIL (Admin only — for diagnostics) ────────────────
app.post('/api/test-email', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { to_email } = req.body
    if (!to_email) return res.status(400).json({ error: 'to_email is required' })
    
    // First, test SMTP connection
    console.log('Testing SMTP connection before sending test email...')
    const connTest = await testConnection()
    if (!connTest.ok) {
      return res.status(500).json({
        success: false,
        error: 'SMTP connection failed',
        details: connTest,
        smtpConfig: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_USER ? process.env.SMTP_USER.substring(0, process.env.SMTP_USER.indexOf('@') || 5) + '...' : 'NOT SET'
        }
      })
    }
    
    // Connection OK, now send test email
    const testHtml = `
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="font-family:Arial;padding:20px;background:#f0f0f0">
        <div style="background:#fff;padding:20px;border-radius:8px;max-width:600px;margin:0 auto">
          <h2 style="color:#333;margin-top:0">✓ Email Test Successful</h2>
          <p>This is a test email from <strong>AssetHub</strong> to verify your SMTP configuration is working.</p>
          <table style="width:100%;margin:20px 0;border-collapse:collapse;font-size:14px">
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>From:</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${process.env.SMTP_FROM_EMAIL}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>To:</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${to_email}</td>
            </tr>
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Time:</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${new Date().toISOString()}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>SMTP Host:</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${process.env.SMTP_HOST}:${process.env.SMTP_PORT}</td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0"/>
          <p style="font-size:12px;color:#666;margin:0">
            If you received this email, your SMTP settings are correct and working properly. 
            You can now proceed to use email features in the application.
          </p>
        </div>
      </body>
      </html>
    `
    
    const result = await sendHtml(to_email, '✓ AssetHub SMTP Test Email', testHtml)
    res.json({
      success: true,
      message: `Test email sent successfully to ${to_email}`,
      messageId: result.info?.messageId,
      smtpConnection: connTest.config,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('Test email error:', err.message)
    res.status(500).json({
      success: false,
      error: err.message,
      smtpConfig: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER ? process.env.SMTP_USER.substring(0, process.env.SMTP_USER.indexOf('@') || 5) + '...' : 'NOT SET',
        hasPassword: !!process.env.SMTP_PASSWORD
      },
      timestamp: new Date().toISOString()
    })
  }
})

// ════════════════════════════════════════════════════════════
// ASSETS
// ════════════════════════════════════════════════════════════

app.get('/api/assets', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        a.id,
        a.asset_code,
        a.sub_sequence,
        a.parent_asset_id,
        a.asset_code || ' ' || a.sub_sequence  AS sub_asset_code,
        a.name,
        a.serial_number,
        a.acquisition_value,
        a.category,
        a.asset_class,
        a.company_code,
        a.cost_center,
        a.reference_invoice_no,
        a.fiscal_year,
        a.assigned_employee,
        a.date_of_purchase,
        a.warranty_date,
        a.make,
        a.supplier_name,
        a.asset_status,
        a.notes,
        a.plant_id,
        a.dept_id,
        a.assigned_user_id,
        a.status,
        a.created_at,
        a.updated_at,
        p.name  AS plant_name,
        p.code  AS plant_code,
        d.name  AS dept_name,
        u.name  AS employee_name
      FROM assets a
      LEFT JOIN plants p      ON a.plant_id        = p.id
      LEFT JOIN departments d ON a.dept_id          = d.id
      LEFT JOIN users u       ON a.assigned_user_id = u.id
      ORDER BY a.created_at DESC
    `)
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.get('/api/assets/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    const assetRes = await pool.query(`
      SELECT a.*,
        a.asset_code || ' ' || a.sub_sequence  AS sub_asset_code,
        p.name      AS plant_name,
        p.code      AS plant_code,
        p.location  AS plant_location,
        d.name      AS dept_name,
        u.name      AS employee_name,
        ccm.description AS cost_center_description
      FROM assets a
      LEFT JOIN plants p         ON a.plant_id        = p.id
      LEFT JOIN departments d    ON a.dept_id          = d.id
      LEFT JOIN users u          ON a.assigned_user_id = u.id
      LEFT JOIN asset_masters ccm ON ccm.type = 'cost_center' AND ccm.value = a.cost_center
      WHERE a.id = $1
    `, [id])
    if (!assetRes.rows.length) return res.status(404).json({ error: 'Asset not found' })
    const asset = assetRes.rows[0]

    const [transfersRes, logsRes] = await Promise.all([
      pool.query(`
        SELECT t.id, t.transfer_code, t.transfer_type, t.status,
               t.created_at, t.approved_at, t.notes,
               fp.name AS from_plant_name,
               tp.name AS to_plant_name,
               u.name  AS initiated_by_name
        FROM transfer_items ti
        JOIN transfers t   ON ti.transfer_id  = t.id
        LEFT JOIN plants fp ON t.from_plant_id = fp.id
        LEFT JOIN plants tp ON t.to_plant_id   = tp.id
        LEFT JOIN users u   ON t.initiated_by  = u.id
        WHERE ti.asset_id = $1
        ORDER BY t.created_at ASC
      `, [id]),

      pool.query(`
        SELECT l.id, l.action, l.details, l.created_at, l.meta,
               u.name AS user_name
        FROM audit_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.module = 'Assets' AND l.details ILIKE $1
        ORDER BY l.created_at ASC
        LIMIT 200
      `, [`%${asset.asset_code}%`])
    ])

    res.json({ asset, transfers: transfersRes.rows, logs: logsRes.rows })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.post('/api/assets', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const body = req.body

    // ── 1. Required field presence (driven by shared spec) ──────
    for (const field of ASSET_FIELD_SPEC) {
      if (!field.required) continue
      const val = body[field.db]
      if (val == null || String(val).trim() === '')
        return res.status(400).json({ error: `${field.label} is required` })
    }

    // ── 2. Destructure ──────────────────────────────────────────
    const {
      asset_code, sub_sequence = 0,
      name, serial_number, acquisition_value,
      category, asset_class, assigned_employee, make, asset_status,
      company_code, cost_center, reference_invoice_no, fiscal_year, supplier_name,
      date_of_purchase, warranty_date, notes,
      plant_id, dept_id, assigned_user_id, status
    } = body

    const code   = String(asset_code).trim()
    const aname  = String(name).trim()
    const subSeq = parseInt(sub_sequence, 10)

    // ── 3. Type-specific validation ─────────────────────────────
    if (isNaN(subSeq) || subSeq < 0)
      return res.status(400).json({ error: 'Sub Asset Number must be 0 or a positive integer' })

    const acqValue = parseFloat(String(acquisition_value).replace(/[,₹$]/g, ''))
    if (isNaN(acqValue))
      return res.status(400).json({ error: 'Acquisition Value must be a number' })
    if (acqValue < 0)
      return res.status(400).json({ error: 'Acquisition Value cannot be negative' })

    if (!['Active', 'Inactive'].includes(String(status)))
      return res.status(400).json({ error: 'Status must be Active or Inactive' })

    // ── 4. Masters validation ────────────────────────────────────
    const mastersRes = await pool.query(
      `SELECT type, value FROM asset_masters WHERE is_active=true AND type = ANY($1)`,
      [['category', 'asset_class', 'asset_status', 'company_code', 'cost_center']]
    )
    const masterSets = {}
    mastersRes.rows.forEach(m => {
      if (!masterSets[m.type]) masterSets[m.type] = new Set()
      masterSets[m.type].add(m.value)
    })
    for (const field of ASSET_FIELD_SPEC.filter(f => f.master)) {
      const val = String(body[field.db] || '').trim()
      if (!masterSets[field.master]?.has(val))
        return res.status(400).json({ error: `${field.label} "${val}" not found in masters` })
    }

    // ── 5. Plant validation ──────────────────────────────────────
    const plantRes = await pool.query(
      'SELECT id FROM plants WHERE id=$1 AND status=$2', [plant_id, 'Active']
    )
    if (!plantRes.rows.length)
      return res.status(400).json({ error: 'Business Area Code (Plant) not found or inactive' })

    // ── 6. Department validation ─────────────────────────────────
    const deptRes = await pool.query(
      'SELECT id FROM departments WHERE id=$1 AND status=$2', [dept_id, 'Active']
    )
    if (!deptRes.rows.length)
      return res.status(400).json({ error: 'Department not found or inactive' })

    // ── 7. Sub Asset Number / parent resolution ──────────────────
    let parentAssetId = null
    if (subSeq > 0) {
      const rootRes = await pool.query(
        'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=0', [code]
      )
      if (!rootRes.rows.length)
        return res.status(400).json({
          error: `Asset Code '${code}' has no root record (Sub Asset Number 0) — create that first.`
        })
      parentAssetId = rootRes.rows[0].id
    }

    // ── 8. Duplicate check ───────────────────────────────────────
    const dupRes = await pool.query(
      'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=$2', [code, subSeq]
    )
    if (dupRes.rows.length)
      return res.status(409).json({
        error: `Asset Code '${code}' with Sub Asset Number ${subSeq} already exists`
      })

    // ── 9. Insert ────────────────────────────────────────────────
    const r = await pool.query(
      `INSERT INTO assets (
         asset_code, sub_sequence, parent_asset_id,
         name, serial_number, acquisition_value,
         category, asset_class, company_code, cost_center,
         reference_invoice_no, fiscal_year, supplier_name,
         assigned_employee, make, asset_status,
         date_of_purchase, warranty_date, notes,
         plant_id, dept_id, assigned_user_id, status,
         created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())
       RETURNING *`,
      [
        code, subSeq, parentAssetId,
        aname, serial_number||null, acqValue,
        String(category).trim(), String(asset_class).trim(),
        String(company_code).trim(), String(cost_center).trim(),
        String(reference_invoice_no).trim(), String(fiscal_year).trim(),
        String(supplier_name).trim(),
        String(assigned_employee).trim(), String(make).trim(), String(asset_status).trim(),
        date_of_purchase||null, warranty_date||null, notes||null,
        plant_id, dept_id, assigned_user_id||null, status
      ]
    )
    await writeAudit(req.user.id, 'Asset Created', 'Assets', `${code} – ${aname}`, req.ip)
    res.status(201).json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
app.put('/api/assets/:id', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const body   = req.body

    // ── 1. Required field presence (driven by shared spec) ──────
    for (const field of ASSET_FIELD_SPEC) {
      if (!field.required) continue
      const val = body[field.db]
      if (val == null || String(val).trim() === '')
        return res.status(400).json({ error: `${field.label} is required` })
    }

    // ── 2. Destructure ──────────────────────────────────────────
    const {
      asset_code, sub_sequence = 0,
      name, serial_number, acquisition_value,
      category, asset_class, assigned_employee, make, asset_status,
      company_code, cost_center, reference_invoice_no, fiscal_year, supplier_name,
      date_of_purchase, warranty_date, notes,
      plant_id, dept_id, assigned_user_id, status
    } = body

    const code   = String(asset_code).trim()
    const aname  = String(name).trim()
    const subSeq = parseInt(sub_sequence, 10)

    // ── 3. Type-specific validation ─────────────────────────────
    if (isNaN(subSeq) || subSeq < 0)
      return res.status(400).json({ error: 'Sub Asset Number must be 0 or a positive integer' })

    const acqValue = parseFloat(String(acquisition_value).replace(/[,₹$]/g, ''))
    if (isNaN(acqValue))
      return res.status(400).json({ error: 'Acquisition Value must be a number' })
    if (acqValue < 0)
      return res.status(400).json({ error: 'Acquisition Value cannot be negative' })

    if (!['Active', 'Inactive'].includes(String(status)))
      return res.status(400).json({ error: 'Status must be Active or Inactive' })

    // ── 4. Masters validation ────────────────────────────────────
    const mastersRes = await pool.query(
      `SELECT type, value FROM asset_masters WHERE is_active=true AND type = ANY($1)`,
      [['category', 'asset_class', 'asset_status', 'company_code', 'cost_center']]
    )
    const masterSets = {}
    mastersRes.rows.forEach(m => {
      if (!masterSets[m.type]) masterSets[m.type] = new Set()
      masterSets[m.type].add(m.value)
    })
    for (const field of ASSET_FIELD_SPEC.filter(f => f.master)) {
      const val = String(body[field.db] || '').trim()
      if (!masterSets[field.master]?.has(val))
        return res.status(400).json({ error: `${field.label} "${val}" not found in masters` })
    }

    // ── 5. Plant validation ──────────────────────────────────────
    const plantRes = await pool.query(
      'SELECT id FROM plants WHERE id=$1 AND status=$2', [plant_id, 'Active']
    )
    if (!plantRes.rows.length)
      return res.status(400).json({ error: 'Business Area Code (Plant) not found or inactive' })

    // ── 6. Department validation ─────────────────────────────────
    const deptRes = await pool.query(
      'SELECT id FROM departments WHERE id=$1 AND status=$2', [dept_id, 'Active']
    )
    if (!deptRes.rows.length)
      return res.status(400).json({ error: 'Department not found or inactive' })

    // ── 7. Sub Asset Number / parent resolution ──────────────────
    // Exclude current record so editing a root and keeping it as root passes
    let parentAssetId = null
    if (subSeq > 0) {
      const rootRes = await pool.query(
        'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=0 AND id != $2',
        [code, id]
      )
      if (!rootRes.rows.length)
        return res.status(400).json({
          error: `Asset Code '${code}' has no root record (Sub Asset Number 0) — create that first.`
        })
      parentAssetId = rootRes.rows[0].id
    }

    // ── 8. Duplicate check (exclude current record) ──────────────
    const dupRes = await pool.query(
      'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=$2 AND id != $3',
      [code, subSeq, id]
    )
    if (dupRes.rows.length)
      return res.status(409).json({
        error: `Asset Code '${code}' with Sub Asset Number ${subSeq} already exists`
      })

    // ── 9. Capture old state for audit diff ─────────────────────
    const oldRec = await pool.query('SELECT * FROM assets WHERE id=$1', [id])
    if (!oldRec.rows.length) return res.status(404).json({ error: 'Asset not found' })

    // ── 10. Update ───────────────────────────────────────────────
    const r = await pool.query(
      `UPDATE assets SET
         asset_code=$1, sub_sequence=$2, parent_asset_id=$3,
         name=$4, serial_number=$5, acquisition_value=$6,
         category=$7, asset_class=$8, company_code=$9, cost_center=$10,
         reference_invoice_no=$11, fiscal_year=$12, supplier_name=$13,
         assigned_employee=$14, make=$15, asset_status=$16,
         date_of_purchase=$17, warranty_date=$18, notes=$19,
         plant_id=$20, dept_id=$21, assigned_user_id=$22, status=$23,
         updated_at=NOW()
       WHERE id=$24
       RETURNING *`,
      [
        code, subSeq, parentAssetId,
        aname, serial_number||null, acqValue,
        String(category).trim(), String(asset_class).trim(),
        String(company_code).trim(), String(cost_center).trim(),
        String(reference_invoice_no).trim(), String(fiscal_year).trim(),
        String(supplier_name).trim(),
        String(assigned_employee).trim(), String(make).trim(), String(asset_status).trim(),
        date_of_purchase||null, warranty_date||null, notes||null,
        plant_id, dept_id, assigned_user_id||null, status,
        id
      ]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' })

    const oldData = oldRec.rows[0]
    const newData = {
      asset_code: code, sub_sequence: subSeq, name: aname,
      serial_number: serial_number||null, acquisition_value: acqValue,
      category: String(category).trim(), asset_class: String(asset_class).trim(),
      company_code: String(company_code).trim(), cost_center: String(cost_center).trim(),
      reference_invoice_no: String(reference_invoice_no).trim(),
      fiscal_year: String(fiscal_year).trim(), supplier_name: String(supplier_name).trim(),
      assigned_employee: String(assigned_employee).trim(), make: String(make).trim(),
      asset_status: String(asset_status).trim(),
      plant_id: plant_id||null, dept_id: dept_id||null, status
    }
    const changed = Object.keys(newData).filter(k => String(oldData[k] ?? '') !== String(newData[k] ?? ''))
    const meta = changed.length
      ? { old: Object.fromEntries(changed.map(k => [k, oldData[k]])), new: Object.fromEntries(changed.map(k => [k, newData[k]])) }
      : null

    await writeAudit(req.user.id, 'Asset Modified', 'Assets', `Asset ${code} updated`, req.ip, meta)
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.delete('/api/assets/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const r = await pool.query('DELETE FROM assets WHERE id=$1 RETURNING id, asset_code', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' })
    await writeAudit(req.user.id, 'Asset Deleted', 'Assets', `Asset ${r.rows[0].asset_code} deleted`, req.ip)
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
// ════════════════════════════════════════════════════════════
// PLANTS
// ════════════════════════════════════════════════════════════
 
app.get('/api/plants', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.id, p.code, p.name, p.location, p.head, p.status, p.challan_prefix, p.created_at,
             COUNT(a.id)::int AS asset_count
      FROM plants p LEFT JOIN assets a ON a.plant_id = p.id
      GROUP BY p.id ORDER BY p.name ASC
    `)
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
app.post('/api/plants', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { code, name, location, head, status, challan_prefix } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })
    const r = await pool.query(
      `INSERT INTO plants (code,name,location,head,status,challan_prefix,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *`,
      [code.trim(), name.trim(), location||null, head||null, status||'Active', challan_prefix?.trim().toUpperCase()||null]
    )
    await writeAudit(req.user.id, 'Plant Added', 'Masters', `Plant ${name} added`, req.ip)
    res.status(201).json({ ...r.rows[0], asset_count: 0 })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.put('/api/plants/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { code, name, location, head, status, challan_prefix } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })
    const r = await pool.query(
      `UPDATE plants SET code=$1,name=$2,location=$3,head=$4,status=$5,challan_prefix=$6 WHERE id=$7 RETURNING *`,
      [code.trim(), name.trim(), location||null, head||null, status||'Active', challan_prefix?.trim().toUpperCase()||null, id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Plant not found' })
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
app.delete('/api/plants/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const check = await pool.query('SELECT COUNT(*) FROM assets WHERE plant_id=$1', [id])
    if (parseInt(check.rows[0].count) > 0)
      return res.status(400).json({ error: 'Cannot delete plant with assigned assets' })
    await pool.query('DELETE FROM plants WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
// ════════════════════════════════════════════════════════════
// DEPARTMENTS
// ════════════════════════════════════════════════════════════
 
app.get('/api/departments', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT d.id, d.code, d.name, d.plant_id, d.manager, d.status, d.created_at,
             p.name AS plant_name, COUNT(a.id)::int AS asset_count
      FROM departments d
      LEFT JOIN plants p ON d.plant_id = p.id
      LEFT JOIN assets a ON a.dept_id = d.id
      GROUP BY d.id, p.name ORDER BY d.name ASC
    `)
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
app.post('/api/departments', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { code, name, plant_id, manager, status } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })

    const parsedPlantId = plant_id ? parseInt(plant_id, 10) : null
    const dupCheck = await pool.query(
      `SELECT id FROM departments 
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) 
         AND LOWER(TRIM(code)) = LOWER(TRIM($2)) 
         AND (plant_id = $3 OR (plant_id IS NULL AND $3::int IS NULL))`,
      [name.trim(), code.trim(), parsedPlantId]
    )
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: 'A department with the exact same Name, Code, and Plant already exists' })
    }

    const r = await pool.query(
      `INSERT INTO departments (code,name,plant_id,manager,status,created_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [code.trim(), name.trim(), parsedPlantId, manager||null, status||'Active']
    )
    await writeAudit(req.user.id, 'Department Added', 'Masters', `Dept ${name} added`, req.ip)
    res.status(201).json({ ...r.rows[0], asset_count: 0 })
  } catch (err) {
    const friendly = mapPgError(err)
    if (friendly) return res.status(400).json({ error: friendly })
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
 
app.put('/api/departments/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { code, name, plant_id, manager, status } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })

    const parsedPlantId = plant_id ? parseInt(plant_id, 10) : null
    const dupCheck = await pool.query(
      `SELECT id FROM departments 
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) 
         AND LOWER(TRIM(code)) = LOWER(TRIM($2)) 
         AND (plant_id = $3 OR (plant_id IS NULL AND $3::int IS NULL))
         AND id <> $4`,
      [name.trim(), code.trim(), parsedPlantId, id]
    )
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: 'A department with the exact same Name, Code, and Plant already exists' })
    }

    const r = await pool.query(
      `UPDATE departments SET code=$1,name=$2,plant_id=$3,manager=$4,status=$5 WHERE id=$6 RETURNING *`,
      [code.trim(), name.trim(), parsedPlantId, manager||null, status||'Active', id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Department not found' })
    res.json(r.rows[0])
  } catch (err) {
    const friendly = mapPgError(err)
    if (friendly) return res.status(400).json({ error: friendly })
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
 
app.delete('/api/departments/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const check = await pool.query('SELECT COUNT(*) FROM assets WHERE dept_id=$1', [id])
    if (parseInt(check.rows[0].count) > 0)
      return res.status(400).json({ error: 'Cannot delete department with assigned assets' })
    await pool.query('DELETE FROM departments WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

function mapPgError(err) {
  if (err.code === '23505') {
    const constraint = err.constraint || err.detail || ''
    if (constraint.includes('employee_id')) return 'Employee ID already exists'
    if (constraint.includes('username'))    return 'Username already exists'
    if (constraint.includes('email'))       return 'Email already exists'
    if (constraint.includes('departments')) return 'A department with the exact same Name, Code, and Plant already exists'
    return 'A record with this value already exists'
  }
  if (err.code === '23502') return 'A required field is missing'
  if (err.code === '23503') return 'Referenced record does not exist'
  return null
}
// ════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════
 
app.get('/api/users', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, employee_id, username, name, email, role, status, created_at FROM users ORDER BY created_at DESC'
    )
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, employee_id, username, name, email, role, status FROM users WHERE id=$1',
      [req.params.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})
 
app.post('/api/users', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { employee_id, username, name, email, password, role, status } = req.body

    // ── Field validation (clean messages, no DB involved yet) ──
    if (!employee_id?.trim()) return res.status(400).json({ error: 'Employee ID is required' })
    if (!username?.trim())    return res.status(400).json({ error: 'Username is required' })
    if (!name?.trim())        return res.status(400).json({ error: 'Full name is required' })
    if (!email?.trim())       return res.status(400).json({ error: 'Email is required' })

    // Always hash a server-validated plaintext password (never accept a client-supplied hash).
    const pwErr = passwordPolicyError(password)
    if (pwErr) return res.status(400).json({ error: `Temporary password: ${pwErr.charAt(0).toLowerCase() + pwErr.slice(1)}` })
    const hashed = await bcrypt.hash(password, 10)

    const r = await pool.query(
      `INSERT INTO users (employee_id, username, name, email, password_hash, role, status, must_change_password, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
       RETURNING id, employee_id, username, name, email, role, status, created_at`,
      [
        employee_id.trim(),
        username.trim(),
        name.trim(),
        email.trim(),
        hashed,
        role || 'User',
        status || 'Active'
      ]
    )

    await writeAudit(req.user.id, 'User Created', 'Users', `User ${name} created`, req.ip)
    res.status(201).json(r.rows[0])

  } catch (err) {
    const friendly = mapPgError(err)
    if (friendly) return res.status(409).json({ error: friendly })
    console.error('POST /api/users error:', err.message)
    res.status(500).json({ error: 'Failed to create user. Please try again.' })
  }
})
app.put('/api/users/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { employee_id, username, name, email, role, status } = req.body

    // ── Field validation ──
    if (!employee_id?.trim()) return res.status(400).json({ error: 'Employee ID is required' })
    if (!username?.trim())    return res.status(400).json({ error: 'Username is required' })
    if (!name?.trim())        return res.status(400).json({ error: 'Full name is required' })
    if (!email?.trim())       return res.status(400).json({ error: 'Email is required' })

    // ── Duplicate check (exclude current user from the check) ──
    const dupCheck = await pool.query(
      `SELECT id, employee_id, username FROM users
       WHERE (employee_id = $1 OR username = $2) AND id != $3`,
      [employee_id.trim(), username.trim(), id]
    )

    if (dupCheck.rows.length > 0) {
      const conflict = dupCheck.rows[0]
      if (conflict.employee_id === employee_id.trim())
        return res.status(409).json({ error: 'Employee ID already exists' })
      if (conflict.username === username.trim())
        return res.status(409).json({ error: 'Username already exists' })
    }

    const oldUser = await pool.query(
      `SELECT employee_id, username, name, email, role, status FROM users WHERE id=$1`, [id]
    )

    const r = await pool.query(
      `UPDATE users
       SET employee_id = $1,
           username    = $2,
           name        = $3,
           email       = $4,
           role        = $5,
           status      = $6
       WHERE id = $7
       RETURNING id, employee_id, username, name, email, role, status, created_at`,
      [
        employee_id.trim(),
        username.trim(),
        name.trim(),
        email.trim(),
        role    || 'User',
        status  || 'Active',
        id
      ]
    )

    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })

    const oldU = oldUser.rows[0] || {}
    const newU = { employee_id: employee_id.trim(), username: username.trim(), name: name.trim(), email: email.trim(), role: role||'User', status: status||'Active' }
    const changedU = Object.keys(newU).filter(k => String(oldU[k] ?? '') !== String(newU[k] ?? ''))
    const metaU = changedU.length ? { old: Object.fromEntries(changedU.map(k => [k, oldU[k]])), new: Object.fromEntries(changedU.map(k => [k, newU[k]])) } : null

    await writeAudit(req.user.id, 'User Modified', 'Users', `User ${name} updated`, req.ip, metaU)
    res.json(r.rows[0])

  } catch (err) {
    const friendly = mapPgError(err)
    if (friendly) return res.status(409).json({ error: friendly })
    console.error('PUT /api/users/:id error:', err.message)
    res.status(500).json({ error: 'Failed to update user. Please try again.' })
  }
}) 

// ── Helper: generate transfer code ─────────────────────────
function genTransferCode() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth()+1).padStart(2,'0')
  const d = String(now.getDate()).padStart(2,'0')
  const rand = Math.floor(Math.random()*9000)+1000
  return `TRF-${y}${m}${d}-${rand}`
}

function genReturnCode() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth()+1).padStart(2,'0')
  const d = String(now.getDate()).padStart(2,'0')
  const rand = Math.floor(Math.random()*9000)+1000
  return `RET-${y}${m}${d}-${rand}`
}

// ── Plant-based challan numbering ──────────────────────────
// Indian fiscal year (Apr–Mar), short form e.g. "2627" for FY2026-27.
function fiscalYearShort(date = new Date()) {
  const y = date.getFullYear()
  const startYear = date.getMonth() >= 3 ? y : y - 1
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`
}

async function getChallanSettings() {
  const r = await pool.query('SELECT * FROM challan_settings WHERE id=1')
  return r.rows[0] || {
    delivery_doc_type: 'AST', return_doc_type: 'RET', seq_padding: 3,
    footer_note: 'Material transferred internally for business use only. Not intended for sale.',
    signatory_label: 'AUTHORISED SIGNATORY',
    template_enabled: false, signature_image: null, template: {},
  }
}

// Atomically reserves the next sequence number for (prefix, fiscal year, doc type)
// and formats the full challan number. docTypeKey is a stable internal key
// ('delivery'/'return') so renaming the printed label never resets the counter.
async function nextChallanNo(prefix, docTypeKey, docTypeLabel, padding) {
  const safePrefix = (prefix || 'GEN').trim().toUpperCase()
  const fy = fiscalYearShort()
  const seqRes = await pool.query(
    `INSERT INTO challan_sequences (prefix, fiscal_year, doc_type, last_seq)
     VALUES ($1,$2,$3,1)
     ON CONFLICT (prefix, fiscal_year, doc_type)
     DO UPDATE SET last_seq = challan_sequences.last_seq + 1
     RETURNING last_seq`,
    [safePrefix, fy, docTypeKey]
  )
  const seq = String(seqRes.rows[0].last_seq).padStart(padding, '0')
  return `${safePrefix}-${docTypeLabel}-${fy}-${seq}`
}

function genRequestCode() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth()+1).padStart(2,'0')
  const d = String(now.getDate()).padStart(2,'0')
  const rand = Math.floor(Math.random()*9000)+1000
  return `REQ-${y}${m}${d}-${rand}`
}

// ════════════════════════════════════════════════════════════
// EMAIL MASTERS
// ════════════════════════════════════════════════════════════

app.get('/api/email-masters', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM email_masters WHERE is_active=true ORDER BY name ASC'
    )
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.post('/api/email-masters', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, department, role } = req.body
    if (!name?.trim() || !email?.trim())
      return res.status(400).json({ error: 'Name and email are required' })
    const emErr = emailError(email)
    if (emErr) return res.status(400).json({ error: emErr })
    const r = await pool.query(
      `INSERT INTO email_masters (name, email, department, role, is_active, created_at)
       VALUES ($1,$2,$3,$4,true,NOW()) RETURNING *`,
      [stripTags(name.trim()), email.trim(), stripTags(department?.trim())||null, role || 'Manager']
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/api/email-masters/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, department, role, is_active } = req.body
    if (!name?.trim() || !email?.trim())
      return res.status(400).json({ error: 'Name and email are required' })
    const emErr = emailError(email)
    if (emErr) return res.status(400).json({ error: emErr })
    const r = await pool.query(
      `UPDATE email_masters SET name=$1, email=$2, department=$3, role=$4, is_active=$5 WHERE id=$6 RETURNING *`,
      [stripTags(name.trim()), email.trim(), stripTags(department?.trim())||null, role || 'Manager', is_active??true, id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.delete('/api/email-masters/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE email_masters SET is_active=false WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// TRANSFERS
// ════════════════════════════════════════════════════════════

// Resolve email to actual name from email_masters or users table
async function resolveApproverName(email) {
  if (!email) return null
  const cleanEmail = String(email).trim().toLowerCase()
  try {
    const res = await pool.query(
      `SELECT name FROM email_masters WHERE LOWER(email) = $1 AND is_active = true
       UNION ALL
       SELECT name FROM users WHERE LOWER(email) = $1
       LIMIT 1`,
      [cleanEmail]
    )
    if (res.rows.length && res.rows[0].name) {
      return stripTags(res.rows[0].name)
    }
  } catch (err) {
    console.error('resolveApproverName error:', err)
  }
  const prefix = cleanEmail.split('@')[0]
  return prefix
    .split(/[._-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function getTransferApprovedByName(t) {
  const { status, approval_stage, dept_head_email, manager_email, dept_head_approved_at, approved_by_name } = t

  const deptHeadName = dept_head_email ? await resolveApproverName(dept_head_email) : null
  const managerName  = manager_email   ? await resolveApproverName(manager_email)   : null

  // 1. Pending Approval
  if (status === 'Pending Approval') {
    // If Dept Head has approved but waiting for Manager approval
    if (dept_head_approved_at || approval_stage === 'manager') {
      return deptHeadName || 'Dept Head Approved'
    }
    // If Dept Head itself has not approved yet
    return 'Waiting for Approvals'
  }

  // 2. Rejected
  if (status === 'Rejected') {
    return 'Rejected'
  }

  // 3. Approved / In Transit / Completed / Returned
  if (approved_by_name && approved_by_name !== 'Email Approval') {
    return approved_by_name
  }

  if (deptHeadName && managerName && deptHeadName.toLowerCase() !== managerName.toLowerCase()) {
    return `${deptHeadName} & ${managerName}`
  }
  if (managerName) return managerName
  if (deptHeadName) return deptHeadName
  return approved_by_name || 'Email Approval'
}

async function getReturnApprovedByName(r) {
  const { approval_status, approval_stage, dept_head_email, manager_email, dept_head_approved_at, approved_by_name } = r

  const deptHeadName = dept_head_email ? await resolveApproverName(dept_head_email) : null
  const managerName  = manager_email   ? await resolveApproverName(manager_email)   : null

  if (approval_status === 'Pending Approval') {
    if (dept_head_approved_at || approval_stage === 'manager') {
      return deptHeadName || 'Dept Head Approved'
    }
    return 'Waiting for Approvals'
  }

  if (approval_status === 'Rejected') {
    return 'Rejected'
  }

  if (approved_by_name && approved_by_name !== 'Email Approval') {
    return approved_by_name
  }

  if (deptHeadName && managerName && deptHeadName.toLowerCase() !== managerName.toLowerCase()) {
    return `${deptHeadName} & ${managerName}`
  }
  if (managerName) return managerName
  if (deptHeadName) return deptHeadName
  return approved_by_name || 'Email Approval'
}

// ── GET /api/transfers — list with stats ─────────────────────
app.get('/api/transfers', authMiddleware, async (req, res) => {
  try {
    const transfers = await pool.query(`
      SELECT
        t.id, t.transfer_code, t.challan_no, t.transfer_type, t.status,
        t.notes, t.dept_head_email, t.manager_email, t.expected_return_date,
        t.approval_stage, t.dept_head_approved_at,
        t.approved_at, t.approved_by_name, t.rejected_reason,
        t.initiated_by, t.created_at,
        fp.name AS from_plant_name, fp.code AS from_plant_code, fp.location AS from_plant_location,
        tp.name AS to_plant_name,   tp.code AS to_plant_code,   tp.location AS to_plant_location,
        u.name  AS initiated_by_name,
        COUNT(ti.id)::int AS asset_count
      FROM transfers t
      LEFT JOIN plants fp   ON t.from_plant_id = fp.id
      LEFT JOIN plants tp   ON t.to_plant_id   = tp.id
      LEFT JOIN users u     ON t.initiated_by  = u.id
      LEFT JOIN transfer_items ti ON ti.transfer_id = t.id
      GROUP BY t.id, fp.id, tp.id, u.id
      ORDER BY t.created_at DESC
    `)

    // Stats for the dashboard tiles
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE status='Pending Approval')::int    AS pending_approval,
        COUNT(*) FILTER (WHERE status='In Transit')::int          AS in_transit,
        COUNT(*) FILTER (WHERE status='Partially Returned')::int  AS partially_returned,
        COUNT(*) FILTER (WHERE status='Completed')::int           AS completed
      FROM transfers
    `)

    const enrichedTransfers = await Promise.all(transfers.rows.map(async t => ({
      ...t,
      approved_by_name: await getTransferApprovedByName(t)
    })))

    res.json({ transfers: enrichedTransfers, stats: stats.rows[0] })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── GET /api/transfers/:id — full detail ─────────────────────
app.get('/api/transfers/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params

    const tr = await pool.query(`
      SELECT
        t.*,
        fp.name AS from_plant_name, fp.code AS from_plant_code, fp.location AS from_plant_location,
        tp.name AS to_plant_name,   tp.code AS to_plant_code,   tp.location AS to_plant_location,
        u.name  AS initiated_by_name
      FROM transfers t
      LEFT JOIN plants fp ON t.from_plant_id = fp.id
      LEFT JOIN plants tp ON t.to_plant_id   = tp.id
      LEFT JOIN users u   ON t.initiated_by  = u.id
      WHERE t.id = $1`, [id])

    if (!tr.rows.length) return res.status(404).json({ error: 'Transfer not found' })

    // Get transfer items (assets)
    const items = await pool.query(`
      SELECT
        ti.id, ti.asset_id, ti.notes,
        a.asset_code, a.asset_code AS asset_tag, a.name, a.category, a.asset_class,
        a.serial_number AS serial, a.acquisition_value, a.acquisition_value AS value,
        a.assigned_employee, a.status AS asset_status,
        d.name AS dept_name, p.name AS current_plant_name
      FROM transfer_items ti
      JOIN assets a      ON ti.asset_id = a.id
      LEFT JOIN departments d ON a.dept_id    = d.id
      LEFT JOIN plants p      ON a.plant_id   = p.id
      WHERE ti.transfer_id = $1
      ORDER BY a.asset_code`, [id])

    // Get return history
    const returns = await pool.query(`
      SELECT
        r.id, r.return_code, r.challan_no, r.return_date, r.returned_by,
        r.notes, r.status, r.created_at,
        r.approval_status, r.dept_head_email, r.manager_email, r.approval_stage, r.dept_head_approved_at,
        r.approved_at, r.approved_by_name, r.rejected_reason,
        COUNT(ri.id)::int AS returned_asset_count
      FROM transfer_returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      WHERE r.transfer_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC`, [id])

    // Get detail of which assets returned in each return
    const returnItemsRaw = await pool.query(`
      SELECT
        ri.return_id, ri.asset_id,
        a.asset_code, a.asset_code AS asset_tag, a.name
      FROM return_items ri
      JOIN assets a ON ri.asset_id = a.id
      WHERE ri.return_id = ANY(
        SELECT id FROM transfer_returns WHERE transfer_id = $1
      )`, [id])

    // Attach return items to returns and enrich return approver names
    const returnsWithItems = await Promise.all(returns.rows.map(async r => ({
      ...r,
      approved_by_name: await getReturnApprovedByName(r),
      items: returnItemsRaw.rows.filter(ri => ri.return_id === r.id)
    })))

    const transfer = tr.rows[0]
    transfer.dept_head_name = transfer.dept_head_email ? await resolveApproverName(transfer.dept_head_email) : null
    transfer.manager_name   = transfer.manager_email   ? await resolveApproverName(transfer.manager_email)   : null
    transfer.approved_by_name = await getTransferApprovedByName(transfer)

    res.json({
      ...transfer,
      items:   items.rows,
      returns: returnsWithItems,
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── POST /api/transfers — create transfer + send approval email
app.post('/api/transfers', authMiddleware, sensitiveLimiter, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { from_plant_id, to_plant_id, transfer_type, asset_ids, dept_head_email, manager_email, notes, expected_return_date } = req.body

    if (!from_plant_id || !to_plant_id)
      return res.status(400).json({ error: 'Source and destination plants are required' })
    if (!asset_ids?.length)
      return res.status(400).json({ error: 'Select at least one asset' })
    if (!dept_head_email)
      return res.status(400).json({ error: 'Department Head email is required for approval' })
    if (!manager_email)
      return res.status(400).json({ error: 'Manager email is required for approval' })
    // Prevent self-approval: the initiator cannot be their own approver
    const initiatorEmail = (req.user.email || '').toLowerCase()
    if (initiatorEmail && [dept_head_email, manager_email].map(e => String(e).toLowerCase()).includes(initiatorEmail))
      return res.status(400).json({ error: 'You cannot select yourself as an approver' })
    for (const e of [dept_head_email, manager_email]) {
      const emErr = emailError(e)
      if (emErr) return res.status(400).json({ error: `Approver email: ${emErr}` })
    }
    if (expected_return_date) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const ret = new Date(expected_return_date)
      if (isNaN(ret.getTime())) return res.status(400).json({ error: 'Invalid expected return date' })
      if (ret < today)          return res.status(400).json({ error: 'Expected return date cannot be in the past' })
    }
    if (from_plant_id === to_plant_id)
      return res.status(400).json({ error: 'Source and destination cannot be the same plant' })

    // Check for assets already in a pending/active transfer
    const alreadyInTransfer = await pool.query(`
      SELECT a.asset_code, a.name
      FROM assets a
      WHERE a.id = ANY($1::int[])
        AND a.status IN ('Pending Transfer', 'In Transit')`,
      [asset_ids])

    if (alreadyInTransfer.rows.length > 0) {
      const names = alreadyInTransfer.rows.map(a => a.asset_code).join(', ')
      return res.status(400).json({
        error: `These assets are already in an active transfer: ${names}`
      })
    }

    const transferCode = genTransferCode()
    const token        = require('crypto').randomBytes(32).toString('hex')
    const tokenExpiry  = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)

    // Delivery challan number is plant-based, assigned once at creation
    const [fromPlantForChallan, challanSettings] = await Promise.all([
      pool.query('SELECT challan_prefix, code FROM plants WHERE id=$1', [from_plant_id]),
      getChallanSettings(),
    ])
    const challanNo = await nextChallanNo(
      fromPlantForChallan.rows[0]?.challan_prefix || fromPlantForChallan.rows[0]?.code,
      'delivery', challanSettings.delivery_doc_type, challanSettings.seq_padding
    )

    // Create transfer (starts at the Department Head approval stage)
    const tr = await pool.query(
      `INSERT INTO transfers
       (transfer_code, challan_no, from_plant_id, to_plant_id, transfer_type, status,
        notes, dept_head_email, manager_email, approval_stage, approval_token, approval_token_expires,
        expected_return_date, initiated_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'Pending Approval',$6,$7,$8,'dept_head',$9,$10,$11,$12,NOW(),NOW())
       RETURNING *`,
      [transferCode, challanNo, from_plant_id, to_plant_id,
       transfer_type||'Returnable',
       stripTags(notes)||null, dept_head_email, manager_email, token, tokenExpiry,
       expected_return_date||null, req.user.id]
    )
    const transfer = tr.rows[0]

    // Insert transfer items
    for (const asset_id of asset_ids) {
      await pool.query(
        'INSERT INTO transfer_items (transfer_id, asset_id) VALUES ($1,$2)',
        [transfer.id, asset_id]
      )
    }

    // Mark assets as Pending Transfer
    await pool.query(
      `UPDATE assets SET status='Pending Transfer', updated_at=NOW()
       WHERE id = ANY($1::int[])`,
      [asset_ids]
    )

    // Fetch data for email
    const [fromPlantR, toPlantR, assetsR] = await Promise.all([
      pool.query('SELECT name, location FROM plants WHERE id=$1', [from_plant_id]),
      pool.query('SELECT name, location FROM plants WHERE id=$1', [to_plant_id]),
      pool.query(`
        SELECT a.asset_code AS asset_tag, a.name, a.category,
               a.acquisition_value AS value, d.name AS dept_name
        FROM assets a
        LEFT JOIN departments d ON a.dept_id = d.id
        WHERE a.id = ANY($1::int[])`, [asset_ids]),
    ])

    const baseUrl    = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
    const approveUrl = `${baseUrl}/api/transfers/${transfer.id}/approve?token=${token}`
    const rejectUrl  = `${baseUrl}/api/transfers/${transfer.id}/reject?token=${token}`

    // Send approval email (non-blocking)
    const emailHtml = buildApprovalEmail({
      transfer,
      fromPlant: fromPlantR.rows[0]?.name || 'Unknown',
      toPlant:   toPlantR.rows[0]?.name   || 'Unknown',
      initiatedBy: req.user.name,
      assets: assetsR.rows,
      approveUrl,
      rejectUrl,
    })

    let emailWarning = null
    let emailSent = false
    try {
      const result = await sendHtml(dept_head_email, `Approval Required: Asset Transfer ${transferCode}`, emailHtml)
      if (!result.skipped) {
        emailSent = true
        console.log(`✓ Approval email successfully sent to ${dept_head_email}`)
      } else {
        emailWarning = result.warning || 'Email service not configured'
        console.warn(`⚠️  Email skipped: ${emailWarning}`)
      }
    } catch (emailErr) {
      console.error('✗ Email send failed:', emailErr.message)
      emailWarning = `Email delivery failed: ${emailErr.message}`
      // Still create the transfer, but log the warning
      await writeAudit(req.user.id, 'Transfer Created (Email Failed)', 'Transfer',
        `${transferCode}: Email to ${dept_head_email} failed - ${emailErr.message}`, req.ip)
    }

    if (emailSent) {
      await writeAudit(req.user.id, 'Transfer Created & Emailed', 'Transfer',
        `${transferCode}: ${asset_ids.length} assets, approval email sent to ${dept_head_email}`, req.ip)
    } else if (!emailWarning) {
      await writeAudit(req.user.id, 'Transfer Created', 'Transfer',
        `${transferCode}: ${asset_ids.length} assets from plant ${from_plant_id} to ${to_plant_id}`, req.ip)
    }

    res.status(201).json({
      ...transfer,
      asset_count: asset_ids.length,
      email_warning: emailWarning,
      email_sent: emailSent
    })
  } catch (err) {
    console.error('Transfer create error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /api/transfers/:id/approve?token=xxx — email link ────
app.get('/api/transfers/:id/approve', async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.query

    const tr = await pool.query(
      `SELECT * FROM transfers WHERE id=$1 AND approval_token=$2`, [id, token]
    )

    if (!tr.rows.length)
      return res.status(400).send(buildApprovalResultHtml(false, '?', 'Invalid or expired approval link.'))

    const transfer = tr.rows[0]

    if (new Date() > new Date(transfer.approval_token_expires))
      return res.status(400).send(buildApprovalResultHtml(false, transfer.transfer_code, 'This approval link has expired.'))

    if (transfer.status !== 'Pending Approval')
      return res.send(buildApprovalResultHtml(true, transfer.transfer_code, `Already processed (${transfer.status}).`))

    // ── Stage 1: Department Head approves → forward to Manager for final approval ──
    if (transfer.approval_stage === 'dept_head') {
      const newToken   = crypto.randomBytes(32).toString('hex')
      const newExpiry  = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)

      await pool.query(
        `UPDATE transfers
         SET dept_head_approved_at=NOW(), approval_stage='manager',
             approval_token=$1, approval_token_expires=$2, updated_at=NOW()
         WHERE id=$3`, [newToken, newExpiry, id])

      const [fromPlantR, toPlantR, assetsR, initiatedByR] = await Promise.all([
        pool.query('SELECT name, location FROM plants WHERE id=$1', [transfer.from_plant_id]),
        pool.query('SELECT name, location FROM plants WHERE id=$1', [transfer.to_plant_id]),
        pool.query(`
          SELECT a.asset_code AS asset_tag, a.name, a.category,
                 a.acquisition_value AS value, d.name AS dept_name
          FROM transfer_items ti
          JOIN assets a ON ti.asset_id = a.id
          LEFT JOIN departments d ON a.dept_id = d.id
          WHERE ti.transfer_id = $1`, [id]),
        pool.query('SELECT name FROM users WHERE id=$1', [transfer.initiated_by]),
      ])

      const baseUrl        = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
      const managerApprove = `${baseUrl}/api/transfers/${id}/approve?token=${newToken}`
      const managerReject  = `${baseUrl}/api/transfers/${id}/reject?token=${newToken}`

      try {
        await sendHtml(transfer.manager_email,
          `Final Approval Required: Asset Transfer ${transfer.transfer_code}`,
          buildApprovalEmail({
            transfer,
            fromPlant:   fromPlantR.rows[0]?.name || 'Unknown',
            toPlant:     toPlantR.rows[0]?.name   || 'Unknown',
            initiatedBy: initiatedByR.rows[0]?.name || 'Admin',
            assets:      assetsR.rows,
            approveUrl:  managerApprove,
            rejectUrl:   managerReject,
          }))
      } catch (emailErr) {
        console.error('✗ Stage-2 email send failed:', emailErr.message)
      }

      await writeAudit(null, 'Transfer Approved (Dept Head)', 'Transfer',
        `${transfer.transfer_code} approved by Department Head, forwarded to ${transfer.manager_email} for final approval`, '0.0.0.0')
      await createNotification('transfer_dept_head_approved',
        `${transfer.transfer_code} approved by the Department Head — forwarded to ${transfer.manager_email} for final approval`,
        transfer.transfer_code, transfer.id)

      return res.send(buildApprovalResultHtml(
        true, transfer.transfer_code, null, 'Transfer',
        `Forwarded to ${transfer.manager_email} for final approval.`
      ))
    }

    // ── Stage 2 (final): Manager approves → move to In Transit ──
    await pool.query(
      `UPDATE transfers
       SET status='In Transit', approved_at=NOW(), approved_by_name='Email Approval',
           approval_token=NULL, updated_at=NOW()
       WHERE id=$1`, [id])

    // Get asset IDs in this transfer
    const items = await pool.query('SELECT asset_id FROM transfer_items WHERE transfer_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)

    // Update asset status to In Transit (plant_id changes AFTER physical completion)
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET status='In Transit', updated_at=NOW() WHERE id=ANY($1::int[])`,
        [assetIds]
      )
    }

    await writeAudit(null, 'Transfer Approved', 'Transfer',
      `${transfer.transfer_code} approved via email`, '0.0.0.0')
    await createNotification('transfer_approved',
      `${transfer.transfer_code} is approved by the manager of ${transfer.manager_email}`,
      transfer.transfer_code, transfer.id)

    res.send(buildApprovalResultHtml(true, transfer.transfer_code, null))
  } catch (err) {
    console.error('Approve error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})

// ── GET /api/transfers/:id/reject?token=xxx — email link ─────
app.get('/api/transfers/:id/reject', async (req, res) => {
  try {
    const { id } = req.params
    const { token, reason } = req.query

    const tr = await pool.query(
      `SELECT * FROM transfers WHERE id=$1 AND approval_token=$2`, [id, token]
    )

    if (!tr.rows.length)
      return res.status(400).send(buildApprovalResultHtml(false, '?', 'Invalid or expired link.'))

    const transfer = tr.rows[0]

    if (new Date() > new Date(transfer.approval_token_expires))
      return res.status(400).send(buildApprovalResultHtml(false, transfer.transfer_code, 'This link has expired.'))

    if (transfer.status !== 'Pending Approval')
      return res.send(buildApprovalResultHtml(false, transfer.transfer_code, `Already processed (${transfer.status}).`))

    await pool.query(
      `UPDATE transfers
       SET status='Rejected', rejected_reason=$1, approval_token=NULL, updated_at=NOW()
       WHERE id=$2`,
      [reason || 'Rejected via email', id]
    )

    // Restore assets to Active
    const items = await pool.query('SELECT asset_id FROM transfer_items WHERE transfer_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET status='Active', updated_at=NOW() WHERE id=ANY($1::int[])`,
        [assetIds]
      )
    }

    const rejectedByStage = transfer.approval_stage === 'dept_head' ? 'Department Head' : 'Manager'
    await writeAudit(null, 'Transfer Rejected', 'Transfer',
      `${transfer.transfer_code} rejected by ${rejectedByStage} via email`, '0.0.0.0')
    await createNotification('transfer_rejected',
      `${transfer.transfer_code} is rejected by the ${rejectedByStage}`,
      transfer.transfer_code, transfer.id)

    res.send(buildApprovalResultHtml(false, transfer.transfer_code, reason || 'Rejected.'))
  } catch (err) {
    console.error('Reject error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})

// ── PUT /api/transfers/:id/complete — mark physically dispatched
app.put('/api/transfers/:id/complete', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const tr = await pool.query('SELECT * FROM transfers WHERE id=$1', [id])
    if (!tr.rows.length) return res.status(404).json({ error: 'Transfer not found' })
    if (!['In Transit', 'Approved'].includes(tr.rows[0].status))
      return res.status(400).json({ error: 'Transfer must be In Transit to complete' })

    await pool.query(
      `UPDATE transfers SET status='Completed', updated_at=NOW() WHERE id=$1`, [id])

    // Move asset plant_id to destination
    const items = await pool.query('SELECT asset_id FROM transfer_items WHERE transfer_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET plant_id=$1, status='Active', updated_at=NOW()
         WHERE id=ANY($2::int[])`,
        [tr.rows[0].to_plant_id, assetIds]
      )
    }

    await writeAudit(req.user.id, 'Transfer Completed', 'Transfer',
      `${tr.rows[0].transfer_code} marked as completed`, req.ip)

    res.json({ message: 'Transfer completed. Asset locations updated.' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── POST /api/transfers/:id/resend-approval — regenerate token & resend email ──
app.post('/api/transfers/:id/resend-approval', authMiddleware, sensitiveLimiter, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const tr = await pool.query(`
      SELECT t.*, fp.name AS from_plant_name, fp.location AS from_plant_location,
             tp.name AS to_plant_name, tp.location AS to_plant_location,
             u.name AS initiated_by_name
      FROM transfers t
      LEFT JOIN plants fp ON t.from_plant_id = fp.id
      LEFT JOIN plants tp ON t.to_plant_id   = tp.id
      LEFT JOIN users u   ON t.initiated_by  = u.id
      WHERE t.id=$1`, [id])
    if (!tr.rows.length) return res.status(404).json({ error: 'Transfer not found' })
    const transfer = tr.rows[0]
    if (transfer.status !== 'Pending Approval')
      return res.status(400).json({ error: 'Transfer is not pending approval' })

    // Stage-aware: resend to whichever approver's turn it currently is
    const recipient = transfer.approval_stage === 'manager' ? transfer.manager_email : transfer.dept_head_email

    const token      = require('crypto').randomBytes(32).toString('hex')
    const tokenExpiry = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS || 74)) * 3600000)
    await pool.query(
      `UPDATE transfers SET approval_token=$1, approval_token_expires=$2 WHERE id=$3`,
      [token, tokenExpiry, id]
    )

    const assets = await pool.query(`
      SELECT a.asset_code AS asset_tag, a.name, a.category, a.acquisition_value AS value,
             d.name AS dept_name
      FROM transfer_items ti
      JOIN assets a ON ti.asset_id = a.id
      LEFT JOIN departments d ON a.dept_id = d.id
      WHERE ti.transfer_id = $1`, [id])

    const baseUrl    = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
    const approveUrl = `${baseUrl}/api/transfers/${id}/approve?token=${token}`
    const rejectUrl  = `${baseUrl}/api/transfers/${id}/reject?token=${token}`

    let emailWarning = null
    try {
      await sendHtml(recipient,
        `[Resent] Transfer Approval Required: ${transfer.transfer_code}`,
        buildApprovalEmail({
          transfer,
          fromPlant:   transfer.from_plant_name || 'Unknown',
          toPlant:     transfer.to_plant_name   || 'Unknown',
          initiatedBy: transfer.initiated_by_name || 'Admin',
          assets:      assets.rows,
          approveUrl,
          rejectUrl,
        })
      )
    } catch (e) {
      emailWarning = e.message
    }

    await writeAudit(req.user.id, 'Transfer Approval Resent', 'Transfer',
      `Transfer approval email resent for ${transfer.transfer_code} to ${recipient}`, req.ip)

    res.json({ ok: true, email_warning: emailWarning })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── POST /api/transfers/:id/return — NOW SENDS APPROVAL EMAIL ──
app.post('/api/transfers/:id/return', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const { asset_ids, returned_by, return_date, notes, dept_head_email, manager_email } = req.body

    if (!asset_ids?.length)
      return res.status(400).json({ error: 'Select at least one asset to return' })
    if (!dept_head_email)
      return res.status(400).json({ error: 'Department Head email is required for approval' })
    if (!manager_email)
      return res.status(400).json({ error: 'Manager email is required for approval' })

    const initiatorEmail = (req.user.email || '').toLowerCase()
    if (initiatorEmail && [dept_head_email, manager_email].map(e => String(e).toLowerCase()).includes(initiatorEmail))
      return res.status(400).json({ error: 'You cannot select yourself as an approver' })

    for (const e of [dept_head_email, manager_email]) {
      const emErr = emailError(e)
      if (emErr) return res.status(400).json({ error: `Approver email: ${emErr}` })
    }

    const tr = await pool.query('SELECT * FROM transfers WHERE id=$1', [id])
    if (!tr.rows.length) return res.status(404).json({ error: 'Transfer not found' })

    const transfer = tr.rows[0]
    if (!['Completed','Partially Returned'].includes(transfer.status))
      return res.status(400).json({ error: 'Transfer must be Completed to process returns' })
    if (transfer.transfer_type !== 'Returnable')
      return res.status(400).json({ error: 'Only Returnable transfers can have returns' })

    const allItems = await pool.query(
      'SELECT asset_id FROM transfer_items WHERE transfer_id=$1', [id])
    const allAssetIds = allItems.rows.map(r => r.asset_id)

    const invalid = asset_ids.filter(aid => !allAssetIds.includes(aid))
    if (invalid.length)
      return res.status(400).json({ error: `Asset IDs not in this transfer: ${invalid.join(', ')}` })

    const alreadyHandled = await pool.query(`
      SELECT ri.asset_id FROM return_items ri
      JOIN transfer_returns tr2 ON ri.return_id = tr2.id
      WHERE tr2.transfer_id = $1
        AND tr2.approval_status IN ('Pending Approval','Approved')
        AND ri.asset_id = ANY($2::int[])`,
      [id, asset_ids])
    if (alreadyHandled.rows.length > 0) {
      return res.status(400).json({ error: `Some assets already returned or pending return approval` })
    }

    const returnCode  = genReturnCode()
    const token        = crypto.randomBytes(32).toString('hex')
    const tokenExpiry  = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)

    const [toPlantForChallan, challanSettings] = await Promise.all([
      pool.query('SELECT challan_prefix, code FROM plants WHERE id=$1', [transfer.to_plant_id]),
      getChallanSettings(),
    ])
    const challanNo = await nextChallanNo(
      toPlantForChallan.rows[0]?.challan_prefix || toPlantForChallan.rows[0]?.code,
      'return', challanSettings.return_doc_type, challanSettings.seq_padding
    )

    const returnedSoFarR = await pool.query(`
      SELECT COUNT(DISTINCT ri.asset_id)::int AS cnt
      FROM return_items ri
      JOIN transfer_returns tr2 ON ri.return_id = tr2.id
      WHERE tr2.transfer_id = $1 AND tr2.approval_status='Approved'`, [id])
    const returnedSoFar   = returnedSoFarR.rows[0].cnt
    const totalInTransfer = allAssetIds.length
    const wouldBeFullAfterThis = (returnedSoFar + asset_ids.length) >= totalInTransfer

    const ret = await pool.query(
      `INSERT INTO transfer_returns
       (return_code, challan_no, transfer_id, return_date, returned_by, notes,
        status, approval_status, dept_head_email, manager_email, approval_stage, approval_token, approval_token_expires, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending Approval',$8,$9,'dept_head',$10,$11,NOW()) RETURNING *`,
      [returnCode, challanNo, id, return_date||new Date().toISOString().split('T')[0],
       returned_by||req.user.name, notes||null,
       wouldBeFullAfterThis ? 'Completed' : 'Partial',
       dept_head_email, manager_email, token, tokenExpiry]
    )
    const transferReturn = ret.rows[0]

    for (const asset_id of asset_ids) {
      await pool.query(
        'INSERT INTO return_items (return_id, asset_id) VALUES ($1,$2)',
        [transferReturn.id, asset_id]
      )
    }

    await pool.query(
      `UPDATE assets SET status='Pending Transfer', updated_at=NOW() WHERE id=ANY($1::int[])`,
      [asset_ids]
    )

    const [fromPlantR, toPlantR, assetsR] = await Promise.all([
      pool.query('SELECT name, location FROM plants WHERE id=$1', [transfer.from_plant_id]),
      pool.query('SELECT name, location FROM plants WHERE id=$1', [transfer.to_plant_id]),
      pool.query(`
        SELECT a.asset_code AS asset_tag, a.name, a.category,
               a.acquisition_value AS value, d.name AS dept_name
        FROM assets a
        LEFT JOIN departments d ON a.dept_id = d.id
        WHERE a.id = ANY($1::int[])`, [asset_ids]),
    ])

    const baseUrl    = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
    const approveUrl = `${baseUrl}/api/transfer-returns/${transferReturn.id}/approve?token=${token}`
    const rejectUrl  = `${baseUrl}/api/transfer-returns/${transferReturn.id}/reject?token=${token}`

    const emailHtml = buildReturnApprovalEmail({
      transferReturn,
      transfer,
      fromPlant: fromPlantR.rows[0]?.name || 'Unknown',
      toPlant:   toPlantR.rows[0]?.name   || 'Unknown',
      returnedBy: returned_by || req.user.name,
      assets: assetsR.rows,
      isFullReturn: wouldBeFullAfterThis,
      approveUrl,
      rejectUrl,
    })

    let emailWarning = null
    try {
      await sendHtml(dept_head_email, `Approval Required: Asset Return ${returnCode}`, emailHtml)
    } catch (emailErr) {
      console.error('Return email send failed:', emailErr.message)
      emailWarning = `Email could not be sent: ${emailErr.message}`
    }

    await writeAudit(req.user.id, 'Return Initiated', 'Transfer',
      `${returnCode}: ${asset_ids.length} asset(s) pending return approval (Dept Head: ${dept_head_email}, Manager: ${manager_email}) for ${transfer.transfer_code}`, req.ip)

    res.status(201).json({
      ...transferReturn,
      asset_count: asset_ids.length,
      email_warning: emailWarning,
    })
  } catch (err) {
    console.error('Return create error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/api/transfer-returns/:id/approve', async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.query

    const rr = await pool.query(
      `SELECT * FROM transfer_returns WHERE id=$1 AND approval_token=$2`, [id, token])

    if (!rr.rows.length)
      return res.status(400).send(buildApprovalResultHtml(false, '?', 'Invalid or expired link.', 'Return'))

    const ret = rr.rows[0]

    if (new Date() > new Date(ret.approval_token_expires))
      return res.status(400).send(buildApprovalResultHtml(false, ret.return_code, 'This approval link has expired.', 'Return'))

    if (ret.approval_status !== 'Pending Approval')
      return res.send(buildApprovalResultHtml(true, ret.return_code, `Already processed (${ret.approval_status}).`, 'Return'))

    const tr = await pool.query('SELECT * FROM transfers WHERE id=$1', [ret.transfer_id])
    const transfer = tr.rows[0]

    if (ret.approval_stage === 'dept_head') {
      const newToken   = crypto.randomBytes(32).toString('hex')
      const newExpiry  = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)

      await pool.query(
        `UPDATE transfer_returns
         SET dept_head_approved_at=NOW(), approval_stage='manager',
             approval_token=$1, approval_token_expires=$2
         WHERE id=$3`, [newToken, newExpiry, id])

      const [fromPlantR, toPlantR, assetsR] = await Promise.all([
        pool.query('SELECT name, location FROM plants WHERE id=$1', [transfer.from_plant_id]),
        pool.query('SELECT name, location FROM plants WHERE id=$1', [transfer.to_plant_id]),
        pool.query(`
          SELECT a.asset_code AS asset_tag, a.name, a.category,
                 a.acquisition_value AS value, d.name AS dept_name
          FROM return_items ri
          JOIN assets a ON ri.asset_id = a.id
          LEFT JOIN departments d ON a.dept_id = d.id
          WHERE ri.return_id = $1`, [id]),
      ])

      const baseUrl        = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
      const managerApprove = `${baseUrl}/api/transfer-returns/${id}/approve?token=${newToken}`
      const managerReject  = `${baseUrl}/api/transfer-returns/${id}/reject?token=${newToken}`

      try {
        await sendHtml(ret.manager_email,
          `Final Approval Required: Asset Return ${ret.return_code}`,
          buildReturnApprovalEmail({
            transferReturn: ret,
            transfer,
            fromPlant:   fromPlantR.rows[0]?.name || 'Unknown',
            toPlant:     toPlantR.rows[0]?.name   || 'Unknown',
            returnedBy:  ret.returned_by || 'Unknown',
            assets:      assetsR.rows,
            isFullReturn: ret.status === 'Completed',
            approveUrl:  managerApprove,
            rejectUrl:   managerReject,
          })
        )
      } catch (emailErr) {
        console.error('✗ Stage-2 return email send failed:', emailErr.message)
      }

      await writeAudit(null, 'Return Approved (Dept Head)', 'Transfer',
        `${ret.return_code} approved by Department Head, forwarded to ${ret.manager_email} for final approval`, '0.0.0.0')
      await createNotification('return_dept_head_approved',
        `${ret.return_code} (${transfer.transfer_code}) approved by Department Head — forwarded to ${ret.manager_email} for final approval`,
        ret.return_code, ret.transfer_id)

      return res.send(buildApprovalResultHtml(
        true, ret.return_code, null, 'Return',
        `Forwarded to ${ret.manager_email} for final approval.`
      ))
    }

    await pool.query(
      `UPDATE transfer_returns
       SET approval_status='Approved', approved_at=NOW(), approved_by_name='Email Approval', approval_token=NULL
       WHERE id=$1`, [id])

    const items = await pool.query('SELECT asset_id FROM return_items WHERE return_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)

    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET plant_id=$1, status='Active', updated_at=NOW() WHERE id=ANY($2::int[])`,
        [transfer.from_plant_id, assetIds]
      )
    }

    const newTransferStatus = ret.status === 'Completed' ? 'Returned' : 'Partially Returned'
    await pool.query(
      `UPDATE transfers SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newTransferStatus, ret.transfer_id]
    )

    await writeAudit(null, 'Return Approved', 'Transfer',
      `${ret.return_code} approved via email`, '0.0.0.0')
    await createNotification('return_approved',
      `${ret.return_code} (${transfer.transfer_code}) is approved by the manager of ${ret.manager_email}`,
      ret.return_code, ret.transfer_id)

    res.send(buildApprovalResultHtml(true, ret.return_code, null, 'Return'))
  } catch (err) {
    console.error('Return approve error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})

app.get('/api/transfer-returns/:id/reject', async (req, res) => {
  try {
    const { id } = req.params
    const { token, reason } = req.query

    const rr = await pool.query(
      `SELECT * FROM transfer_returns WHERE id=$1 AND approval_token=$2`, [id, token])

    if (!rr.rows.length)
      return res.status(400).send(buildApprovalResultHtml(false, '?', 'Invalid or expired link.', 'Return'))

    const ret = rr.rows[0]

    if (new Date() > new Date(ret.approval_token_expires))
      return res.status(400).send(buildApprovalResultHtml(false, ret.return_code, 'This link has expired.', 'Return'))

    if (ret.approval_status !== 'Pending Approval')
      return res.send(buildApprovalResultHtml(false, ret.return_code, `Already processed (${ret.approval_status}).`, 'Return'))

    await pool.query(
      `UPDATE transfer_returns
       SET approval_status='Rejected', rejected_reason=$1, approval_token=NULL
       WHERE id=$2`,
      [reason || 'Rejected via email', id]
    )

    const items = await pool.query('SELECT asset_id FROM return_items WHERE return_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET status='Active', updated_at=NOW() WHERE id=ANY($1::int[])`,
        [assetIds]
      )
    }

    await writeAudit(null, 'Return Rejected', 'Transfer',
      `${ret.return_code} rejected via email`, '0.0.0.0')
    await createNotification('return_rejected',
      `${ret.return_code} is rejected by approver`,
      ret.return_code, ret.transfer_id)

    res.send(buildApprovalResultHtml(false, ret.return_code, reason || 'Rejected.', 'Return'))
  } catch (err) {
    console.error('Return reject error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})

// ── POST /api/transfer-returns/:id/resend-approval — regenerate token & resend email ──
app.post('/api/transfer-returns/:id/resend-approval', authMiddleware, sensitiveLimiter, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const rr = await pool.query('SELECT * FROM transfer_returns WHERE id=$1', [id])
    if (!rr.rows.length) return res.status(404).json({ error: 'Return not found' })
    const ret = rr.rows[0]
    if (ret.approval_status !== 'Pending Approval')
      return res.status(400).json({ error: 'Return is not pending approval' })

    const tr = await pool.query(`
      SELECT t.*, fp.name AS from_plant_name, fp.location AS from_plant_location,
             tp.name AS to_plant_name, tp.location AS to_plant_location
      FROM transfers t
      LEFT JOIN plants fp ON t.from_plant_id = fp.id
      LEFT JOIN plants tp ON t.to_plant_id   = tp.id
      WHERE t.id=$1`, [ret.transfer_id])
    const transfer = tr.rows[0]

    // Fall back to the transfer's manager_email if the return doesn't have one
    const recipientEmail = ret.manager_email || transfer.manager_email
    if (!recipientEmail)
      return res.status(400).json({ error: 'No manager email on record to resend to' })

    const token      = require('crypto').randomBytes(32).toString('hex')
    const tokenExpiry = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS || 74)) * 3600000)
    await pool.query(
      `UPDATE transfer_returns SET approval_token=$1, approval_token_expires=$2, manager_email=COALESCE(manager_email,$3) WHERE id=$4`,
      [token, tokenExpiry, recipientEmail, id]
    )

    const assets = await pool.query(`
      SELECT a.asset_code AS asset_tag, a.name, a.category, a.acquisition_value AS value,
             d.name AS dept_name
      FROM return_items ri
      JOIN assets a ON ri.asset_id = a.id
      LEFT JOIN departments d ON a.dept_id = d.id
      WHERE ri.return_id = $1`, [id])

    const baseUrl    = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
    const approveUrl = `${baseUrl}/api/transfer-returns/${id}/approve?token=${token}`
    const rejectUrl  = `${baseUrl}/api/transfer-returns/${id}/reject?token=${token}`

    let emailWarning = null
    try {
      await sendHtml(recipientEmail,
        `[Resent] Return Approval Required: ${ret.return_code}`,
        buildReturnApprovalEmail({
          transferReturn: ret,
          transfer,
          fromPlant:   transfer.from_plant_name || 'Unknown',
          toPlant:     transfer.to_plant_name   || 'Unknown',
          returnedBy:  ret.returned_by || 'Unknown',
          assets:      assets.rows,
          isFullReturn: ret.status === 'Completed',
          approveUrl,
          rejectUrl,
        })
      )
    } catch (e) {
      emailWarning = e.message
    }

    await writeAudit(req.user.id, 'Return Approval Resent', 'Transfer',
      `Return approval email resent for ${ret.return_code} to ${recipientEmail}`, req.ip)

    res.json({ ok: true, email_warning: emailWarning })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── DELETE /api/transfer-returns/:id — cancel a pending return ──
app.delete('/api/transfer-returns/:id', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const rr = await pool.query('SELECT * FROM transfer_returns WHERE id=$1', [id])
    if (!rr.rows.length) return res.status(404).json({ error: 'Return not found' })
    const ret = rr.rows[0]
    if (ret.approval_status !== 'Pending Approval')
      return res.status(400).json({ error: 'Only pending returns can be cancelled' })

    const items = await pool.query('SELECT asset_id FROM return_items WHERE return_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)

    // Restore assets to Active (still at destination)
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET status='Active', updated_at=NOW() WHERE id=ANY($1::int[])`,
        [assetIds]
      )
    }

    // Revert transfer status to Completed if it was changed to Partially Returned by this return
    const transfer = await pool.query('SELECT status FROM transfers WHERE id=$1', [ret.transfer_id])
    if (transfer.rows[0]?.status === 'Partially Returned') {
      const approvedReturns = await pool.query(
        `SELECT COUNT(*) FROM transfer_returns WHERE transfer_id=$1 AND approval_status='Approved'`,
        [ret.transfer_id]
      )
      if (parseInt(approvedReturns.rows[0].count) === 0) {
        await pool.query(`UPDATE transfers SET status='Completed', updated_at=NOW() WHERE id=$1`, [ret.transfer_id])
      }
    }

    await pool.query('DELETE FROM return_items WHERE return_id=$1', [id])
    await pool.query('DELETE FROM transfer_returns WHERE id=$1', [id])

    await writeAudit(req.user.id, 'Return Cancelled', 'Transfer',
      `${ret.return_code} cancelled`, req.ip)

    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── GET /api/notifications ────────────────────────────────────
app.get('/api/notifications', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`
    )
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── PUT /api/notifications/read-all ──────────────────────────
app.put('/api/notifications/read-all', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read=true`)
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── PUT /api/notifications/:id/read ──────────────────────────
app.put('/api/notifications/:id/read', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read=true WHERE id=$1`, [req.params.id])
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── GET /api/transfers/:id/returnable — which assets can be returned
app.get('/api/transfers/:id/returnable', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params

    // All assets in transfer
    const all = await pool.query(`
      SELECT ti.asset_id,
             a.asset_code AS asset_tag, a.name, a.category, a.acquisition_value AS value,
             d.name AS dept_name
      FROM transfer_items ti
      JOIN assets a ON ti.asset_id = a.id
      LEFT JOIN departments d ON a.dept_id = d.id
      WHERE ti.transfer_id = $1`, [id])

    // Already returned assets
    const returned = await pool.query(`
      SELECT ri.asset_id
      FROM return_items ri
      JOIN transfer_returns tr2 ON ri.return_id = tr2.id
      WHERE tr2.transfer_id = $1`, [id])

    const returnedIds = new Set(returned.rows.map(r => r.asset_id))
    const returnable  = all.rows.filter(a => !returnedIds.has(a.asset_id))

    res.json(returnable)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── DELETE /api/transfers/:id — only pending approval transfers
app.delete('/api/transfers/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const tr = await pool.query('SELECT * FROM transfers WHERE id=$1', [id])
    if (!tr.rows.length) return res.status(404).json({ error: 'Not found' })
    if (tr.rows[0].status !== 'Pending Approval')
      return res.status(400).json({ error: 'Only Pending Approval transfers can be deleted' })

    // Restore assets
    const items = await pool.query('SELECT asset_id FROM transfer_items WHERE transfer_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET status='Active', updated_at=NOW() WHERE id=ANY($1::int[])`,
        [assetIds]
      )
    }

    await pool.query('DELETE FROM transfers WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})


// ════════════════════════════════════════════════════════════
// ASSET REQUESTS (3-stage approval: Dept Head → Asset Codes → Manager)
// ════════════════════════════════════════════════════════════

// Send the stage email for whichever approver is currently active.
async function sendAssetRequestStageEmail(reqRow, recipient, stageLabel) {
  const [deptR, userR, itemsR] = await Promise.all([
    reqRow.dept_id      ? pool.query('SELECT name FROM departments WHERE id=$1', [reqRow.dept_id])    : Promise.resolve({ rows: [] }),
    reqRow.requested_by ? pool.query('SELECT name FROM users WHERE id=$1', [reqRow.requested_by])     : Promise.resolve({ rows: [] }),
    pool.query(`SELECT i.*, p.name AS plant_name
                FROM asset_request_items i LEFT JOIN plants p ON i.plant_id = p.id
                WHERE i.request_id=$1 ORDER BY i.seq`, [reqRow.id]),
  ])
  const baseUrl    = process.env.APPROVAL_BASE_URL || 'http://localhost:3001'
  const approveUrl = `${baseUrl}/api/asset-requests/${reqRow.id}/approve?token=${reqRow.approval_token}`
  const rejectUrl  = `${baseUrl}/api/asset-requests/${reqRow.id}/reject?token=${reqRow.approval_token}`
  const html = buildAssetRequestApprovalEmail({
    request:     reqRow,
    requestedBy: userR.rows[0]?.name || 'A user',
    deptName:    deptR.rows[0]?.name || '—',
    items:       itemsR.rows,
    approveUrl, rejectUrl, stageLabel,
  })
  return sendHtml(recipient, `Asset Request Approval Required: ${reqRow.request_code}`, html)
}

// ── GET /api/asset-requests — list + stats ───────────────────
app.get('/api/asset-requests', authMiddleware, async (req, res) => {
  try {
    const list = await pool.query(`
      SELECT ar.*,
             d.name AS dept_name,
             u.name AS requested_by_name,
             (SELECT COUNT(*)::int FROM asset_request_items i WHERE i.request_id = ar.id) AS item_count,
             (SELECT i.material_description FROM asset_request_items i
              WHERE i.request_id = ar.id ORDER BY i.seq LIMIT 1) AS first_item
      FROM asset_requests ar
      LEFT JOIN departments d ON ar.dept_id = d.id
      LEFT JOIN users u       ON ar.requested_by = u.id
      ORDER BY ar.created_at DESC
    `)
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='Pending Dept Head')::int   AS pending_dept_head,
        COUNT(*) FILTER (WHERE status='Waiting Asset Code')::int  AS waiting_asset_code,
        COUNT(*) FILTER (WHERE status='Pending Manager')::int     AS pending_manager,
        COUNT(*) FILTER (WHERE status='Approved')::int            AS approved,
        COUNT(*) FILTER (WHERE status='Rejected')::int            AS rejected
      FROM asset_requests
    `)
    res.json({ requests: list.rows, stats: stats.rows[0] })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── GET /api/asset-requests/:id — single with line items ─────
app.get('/api/asset-requests/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    const r = await pool.query(`
      SELECT ar.*,
             d.name AS dept_name,
             u.name AS requested_by_name
      FROM asset_requests ar
      LEFT JOIN departments d ON ar.dept_id = d.id
      LEFT JOIN users u       ON ar.requested_by = u.id
      WHERE ar.id = $1`, [id])
    if (!r.rows.length) return res.status(404).json({ error: 'Asset request not found' })
    const items = await pool.query(`
      SELECT i.*, p.name AS plant_name
      FROM asset_request_items i LEFT JOIN plants p ON i.plant_id = p.id
      WHERE i.request_id=$1 ORDER BY i.seq`, [id])
    res.json({ ...r.rows[0], items: items.rows })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── POST /api/asset-requests — create (any logged-in user) ───
app.post('/api/asset-requests', authMiddleware, sensitiveLimiter, async (req, res) => {
  const client = await pool.connect()
  try {
    const { asset_owner, dept_id, dept_head_email, manager_email, items } = req.body

    if (!dept_id)            return res.status(400).json({ error: 'Department is required' })
    if (!asset_owner?.trim())return res.status(400).json({ error: 'Asset Owner is required' })
    if (!dept_head_email)    return res.status(400).json({ error: 'Department Head approver is required' })
    if (!manager_email)      return res.status(400).json({ error: 'Manager approver is required' })
    // Prevent self-approval: the initiator cannot be their own approver
    const initiatorEmail = (req.user.email || '').toLowerCase()
    if (initiatorEmail && [dept_head_email, manager_email].map(e => String(e).toLowerCase()).includes(initiatorEmail))
      return res.status(400).json({ error: 'You cannot select yourself as an approver' })
    for (const e of [dept_head_email, manager_email]) {
      const emErr = emailError(e)
      if (emErr) return res.status(400).json({ error: `Approver email: ${emErr}` })
    }
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Add at least one asset line item' })
    if (items.length > 200)  return res.status(400).json({ error: 'A request cannot exceed 200 line items' })

    // Load master + plant sets once to validate restricted fields against them
    const [ccRes, ctrRes, plantRes] = await Promise.all([
      pool.query(`SELECT value FROM asset_masters WHERE is_active=true AND type='company_code'`),
      pool.query(`SELECT value FROM asset_masters WHERE is_active=true AND type='cost_center'`),
      pool.query(`SELECT id FROM plants WHERE status='Active'`),
    ])
    const companySet = new Set(ccRes.rows.map(r => r.value))
    const costSet    = new Set(ctrRes.rows.map(r => r.value))
    const plantSet   = new Set(plantRes.rows.map(r => r.id))

    // Validate + normalize each line item
    const norm = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const n = i + 1
      if (!it.material_description?.trim()) return res.status(400).json({ error: `Item ${n}: Material Description is required` })
      const qty = parseInt(it.quantity, 10)
      if (isNaN(qty) || qty < 1)            return res.status(400).json({ error: `Item ${n}: Quantity must be a positive whole number` })
      if (qty > 100000)                     return res.status(400).json({ error: `Item ${n}: Quantity is too large` })
      if (!it.company_code?.trim())         return res.status(400).json({ error: `Item ${n}: Company Code is required` })
      if (!it.cost_center?.trim())          return res.status(400).json({ error: `Item ${n}: Cost Center is required` })
      if (!it.plant_id)                     return res.status(400).json({ error: `Item ${n}: Asset Location is required` })
      // Restricted fields must match configured master data (reject arbitrary values)
      if (companySet.size && !companySet.has(it.company_code.trim()))
        return res.status(400).json({ error: `Item ${n}: Company Code "${it.company_code.trim()}" is not a valid master value` })
      if (costSet.size && !costSet.has(it.cost_center.trim()))
        return res.status(400).json({ error: `Item ${n}: Cost Center "${it.cost_center.trim()}" is not a valid master value` })
      if (!plantSet.has(parseInt(it.plant_id, 10)))
        return res.status(400).json({ error: `Item ${n}: Asset Location is not a valid active plant` })
      const price = it.unit_price != null && it.unit_price !== '' ? parseFloat(String(it.unit_price).replace(/[,₹$]/g, '')) : null
      if (price != null && (isNaN(price) || price < 0))
        return res.status(400).json({ error: `Item ${n}: Unit Price must be a non-negative number` })
      const life = it.asset_life != null && it.asset_life !== '' ? parseInt(it.asset_life, 10) : null
      if (life != null && life < 0)
        return res.status(400).json({ error: `Item ${n}: Asset Life cannot be negative` })
      norm.push({
        material_description: stripTags(it.material_description.trim()),
        quantity: qty,
        unit_price: price,
        total_amount: price != null ? price * qty : null,
        company_code: it.company_code.trim(),
        cost_center: it.cost_center.trim(),
        project_name: stripTags(it.project_name?.trim()) || null,
        plant_id: parseInt(it.plant_id, 10),
        asset_life: life,
        remarks: stripTags(it.remarks?.trim()) || null,
      })
    }
    const requestTotal = norm.reduce((s, it) => s + (it.total_amount || 0), 0)

    const code   = genRequestCode()
    const token  = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)

    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO asset_requests
        (request_code, requested_by, asset_owner, dept_id, total_amount, status,
         dept_head_email, manager_email, approval_token, approval_token_expires, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'Pending Dept Head',$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [code, req.user.id, stripTags(asset_owner.trim()), dept_id, requestTotal,
       dept_head_email, manager_email, token, expiry]
    )
    const request = ins.rows[0]
    for (let i = 0; i < norm.length; i++) {
      const it = norm[i]
      await client.query(
        `INSERT INTO asset_request_items
          (request_id, seq, material_description, quantity, unit_price, total_amount,
           company_code, cost_center, project_name, plant_id, asset_life, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [request.id, i + 1, it.material_description, it.quantity, it.unit_price, it.total_amount,
         it.company_code, it.cost_center, it.project_name, it.plant_id, it.asset_life, it.remarks]
      )
    }
    await client.query('COMMIT')

    let emailWarning = null
    try {
      const result = await sendAssetRequestStageEmail(request, dept_head_email, 'Department Head Approval')
      if (result?.skipped) emailWarning = result.warning || 'Email service not configured'
    } catch (e) {
      emailWarning = `Email delivery failed: ${e.message}`
    }

    await writeAudit(req.user.id, 'Asset Request Created', 'Asset Requests',
      `${code}: ${norm.length} item(s), approval email sent to ${dept_head_email}`, req.ip)

    res.status(201).json({ ...request, email_warning: emailWarning })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Asset request create error:', err)
    res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// ── PUT /api/asset-requests/:id/codes — assign codes (Admin/Manager) ──
app.put('/api/asset-requests/:id/codes', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const { codes } = req.body

    const r = await pool.query('SELECT * FROM asset_requests WHERE id=$1', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'Asset request not found' })
    const request = r.rows[0]
    if (request.status !== 'Waiting Asset Code')
      return res.status(400).json({ error: 'Asset codes can only be assigned while the request is Waiting for Asset Code' })

    const itemsRes = await pool.query('SELECT id, seq FROM asset_request_items WHERE request_id=$1 ORDER BY seq', [id])
    const items = itemsRes.rows

    const clean = (Array.isArray(codes) ? codes : []).map(c => String(c || '').trim())
    if (clean.some(c => !c))
      return res.status(400).json({ error: 'All asset code fields must be filled in' })
    if (clean.length !== items.length)
      return res.status(400).json({ error: `Expected ${items.length} asset code(s) — one per line item — got ${clean.length}` })
    const dupes = clean.filter((c, i) => clean.indexOf(c) !== i)
    if (dupes.length)
      return res.status(400).json({ error: `Duplicate asset code(s) in this request: ${[...new Set(dupes)].join(', ')}` })

    // Assign one code per line item (in seq order)
    for (let i = 0; i < items.length; i++) {
      await pool.query('UPDATE asset_request_items SET asset_code=$1 WHERE id=$2', [clean[i], items[i].id])
    }

    const token  = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)
    const upd = await pool.query(
      `UPDATE asset_requests
       SET status='Pending Manager', approval_token=$1, approval_token_expires=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`, [token, expiry, id]
    )
    const updated = upd.rows[0]

    let emailWarning = null
    try {
      const result = await sendAssetRequestStageEmail(updated, updated.manager_email, 'Final Manager Approval')
      if (result?.skipped) emailWarning = result.warning || 'Email service not configured'
    } catch (e) {
      emailWarning = `Email delivery failed: ${e.message}`
    }

    await writeAudit(req.user.id, 'Asset Codes Assigned', 'Asset Requests',
      `${request.request_code}: ${clean.length} codes assigned, forwarded to ${updated.manager_email} for final approval`, req.ip)
    await createNotification('asset_request_codes_assigned',
      `${request.request_code}: asset codes assigned — forwarded to ${updated.manager_email} for final approval`,
      request.request_code, request.id)

    res.json({ ...updated, email_warning: emailWarning })
  } catch (err) {
    console.error('Assign asset codes error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── POST /api/asset-requests/:id/resend-approval ─────────────
app.post('/api/asset-requests/:id/resend-approval', authMiddleware, sensitiveLimiter, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const r = await pool.query('SELECT * FROM asset_requests WHERE id=$1', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'Asset request not found' })
    const request = r.rows[0]

    let recipient, stageLabel
    if (request.status === 'Pending Dept Head')      { recipient = request.dept_head_email; stageLabel = 'Department Head Approval' }
    else if (request.status === 'Pending Manager')   { recipient = request.manager_email;   stageLabel = 'Final Manager Approval' }
    else return res.status(400).json({ error: 'This request is not awaiting email approval right now' })

    const token  = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + (parseInt(process.env.APPROVAL_TOKEN_EXPIRY_HOURS||74)) * 3600000)
    await pool.query('UPDATE asset_requests SET approval_token=$1, approval_token_expires=$2 WHERE id=$3', [token, expiry, id])

    let emailWarning = null
    try {
      const result = await sendAssetRequestStageEmail({ ...request, approval_token: token }, recipient, stageLabel)
      if (result?.skipped) emailWarning = result.warning || 'Email service not configured'
    } catch (e) {
      emailWarning = e.message
    }

    await writeAudit(req.user.id, 'Asset Request Approval Resent', 'Asset Requests',
      `Approval email resent for ${request.request_code} to ${recipient}`, req.ip)
    res.json({ ok: true, email_warning: emailWarning })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── DELETE /api/asset-requests/:id — Admin, only if not Approved ──
app.delete('/api/asset-requests/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const r = await pool.query('SELECT status, request_code FROM asset_requests WHERE id=$1', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    if (r.rows[0].status === 'Approved')
      return res.status(400).json({ error: 'Approved requests cannot be deleted' })
    await pool.query('DELETE FROM asset_requests WHERE id=$1', [id])  // codes cascade
    await writeAudit(req.user.id, 'Asset Request Deleted', 'Asset Requests', `${r.rows[0].request_code} deleted`, req.ip)
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ── GET /api/asset-requests/:id/approve?token= — email link ──
app.get('/api/asset-requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.query
    const r = await pool.query('SELECT * FROM asset_requests WHERE id=$1 AND approval_token=$2', [id, token])
    if (!r.rows.length)
      return res.status(400).send(buildApprovalResultHtml(false, '?', 'Invalid or expired approval link.', 'Asset Request'))
    const request = r.rows[0]
    if (new Date() > new Date(request.approval_token_expires))
      return res.status(400).send(buildApprovalResultHtml(false, request.request_code, 'This approval link has expired.', 'Asset Request'))

    // Stage 1: Department Head approves → move to asset-code assignment
    if (request.status === 'Pending Dept Head') {
      await pool.query(
        `UPDATE asset_requests SET status='Waiting Asset Code', dept_head_approved_at=NOW(),
         approval_token=NULL, updated_at=NOW() WHERE id=$1`, [id])
      await writeAudit(null, 'Asset Request Approved (Dept Head)', 'Asset Requests',
        `${request.request_code} approved by Department Head — awaiting asset-code assignment`, '0.0.0.0')
      await createNotification('asset_request_dept_head_approved',
        `${request.request_code} approved by the Department Head — ready for asset-code assignment`,
        request.request_code, request.id)
      return res.send(buildApprovalResultHtml(
        true, request.request_code, null, 'Asset Request',
        'The asset team will now assign asset codes, then forward it to the Manager for final approval.'
      ))
    }

    // Stage 3 (final): Manager approves → Approved
    if (request.status === 'Pending Manager') {
      await pool.query(
        `UPDATE asset_requests SET status='Approved', manager_approved_at=NOW(),
         approval_token=NULL, updated_at=NOW() WHERE id=$1`, [id])
      await writeAudit(null, 'Asset Request Approved', 'Asset Requests',
        `${request.request_code} given final approval by Manager`, '0.0.0.0')
      await createNotification('asset_request_approved',
        `${request.request_code} has been fully approved by the Manager`,
        request.request_code, request.id)
      return res.send(buildApprovalResultHtml(true, request.request_code, null, 'Asset Request'))
    }

    return res.send(buildApprovalResultHtml(true, request.request_code, `Already processed (${request.status}).`, 'Asset Request'))
  } catch (err) {
    console.error('Asset request approve error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})

// ── GET /api/asset-requests/:id/reject?token= — email link ───
app.get('/api/asset-requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params
    const { token, reason } = req.query
    const r = await pool.query('SELECT * FROM asset_requests WHERE id=$1 AND approval_token=$2', [id, token])
    if (!r.rows.length)
      return res.status(400).send(buildApprovalResultHtml(false, '?', 'Invalid or expired link.', 'Asset Request'))
    const request = r.rows[0]
    if (new Date() > new Date(request.approval_token_expires))
      return res.status(400).send(buildApprovalResultHtml(false, request.request_code, 'This link has expired.', 'Asset Request'))
    if (!['Pending Dept Head', 'Pending Manager'].includes(request.status))
      return res.send(buildApprovalResultHtml(false, request.request_code, `Already processed (${request.status}).`, 'Asset Request'))

    const rejectedStage = request.status === 'Pending Dept Head' ? 'Department Head' : 'Manager'
    await pool.query(
      `UPDATE asset_requests SET status='Rejected', rejected_reason=$1, rejected_stage=$2,
       approval_token=NULL, updated_at=NOW() WHERE id=$3`,
      [reason || 'Rejected via email', rejectedStage, id])

    await writeAudit(null, 'Asset Request Rejected', 'Asset Requests',
      `${request.request_code} rejected by ${rejectedStage} via email`, '0.0.0.0')
    await createNotification('asset_request_rejected',
      `${request.request_code} is rejected by the ${rejectedStage}`,
      request.request_code, request.id)

    res.send(buildApprovalResultHtml(false, request.request_code, reason || 'Rejected.', 'Asset Request'))
  } catch (err) {
    console.error('Asset request reject error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})


// ════════════════════════════════════════════════════════════
// MASTERS LOOKUP (used by Bulk Upload validation)
// ════════════════════════════════════════════════════════════

app.get('/api/masters/lookup', authMiddleware, async (req, res) => {
  try {
    const [plants, depts, masters] = await Promise.all([
      pool.query('SELECT id, code, name FROM plants WHERE status=$1 ORDER BY name', ['Active']),
      pool.query('SELECT id, code, name FROM departments WHERE status=$1 ORDER BY name', ['Active']),
      pool.query(`SELECT type, value, description FROM asset_masters WHERE is_active=true ORDER BY type, sort_order, value`),
    ])

    const mastersGrouped = {}
    masters.rows.forEach(r => {
      if (!mastersGrouped[r.type]) mastersGrouped[r.type] = []
      // cost_center carries a description; all other types are plain value strings
      mastersGrouped[r.type].push(
        r.type === 'cost_center' ? { value: r.value, description: r.description } : r.value
      )
    })

    res.json({
      plants:         plants.rows,
      departments:    depts.rows,
      categories:     mastersGrouped['category']      || [],
      asset_classes:  mastersGrouped['asset_class']   || [],
      asset_statuses: mastersGrouped['asset_status']  || [],
      statuses:       mastersGrouped['status']        || [],
      company_codes:  mastersGrouped['company_code']  || [],
      cost_centers:   mastersGrouped['cost_center']   || [],
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// ASSET MASTERS (Categories, Asset Classes, Asset Status, etc.)
// ════════════════════════════════════════════════════════════

app.get('/api/asset-masters', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query
    const query = type
      ? `SELECT id, type, value, description, sort_order, is_active FROM asset_masters WHERE type=$1 AND is_active=true ORDER BY sort_order, value`
      : `SELECT id, type, value, description, sort_order, is_active FROM asset_masters ORDER BY type, sort_order, value`
    const params = type ? [type] : []
    const r = await pool.query(query, params)
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.get('/api/asset-masters/all', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, type, value, description, sort_order, is_active
       FROM asset_masters
       WHERE is_active = true
       ORDER BY type, sort_order, value`
    )
    const grouped = {}
    r.rows.forEach(row => {
      if (!grouped[row.type]) grouped[row.type] = []
      grouped[row.type].push({ id: row.id, value: row.value, description: row.description, sort_order: row.sort_order })
    })
    res.json(grouped)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.post('/api/asset-masters', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { type, value, sort_order, description } = req.body
    if (!type?.trim() || !value?.trim())
      return res.status(400).json({ error: 'Type and value are required' })

    const r = await pool.query(
      `INSERT INTO asset_masters (type, value, description, sort_order, is_active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id, type, value, description, sort_order, is_active`,
      [type.trim(), value.trim(), description?.trim() || null, sort_order || 0]
    )
    await writeAudit(req.user.id, 'Master Added', 'Masters', `${type}: "${value}" added`, req.ip)
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This value already exists' })
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/api/asset-masters/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { value, sort_order, is_active, description } = req.body
    if (!value?.trim()) return res.status(400).json({ error: 'Value is required' })

    const oldMaster = await pool.query(`SELECT type, value, description, sort_order, is_active FROM asset_masters WHERE id=$1`, [id])

    const r = await pool.query(
      `UPDATE asset_masters SET value=$1, description=$2, sort_order=$3, is_active=$4 WHERE id=$5
       RETURNING id, type, value, description, sort_order, is_active`,
      [value.trim(), description?.trim() || null, sort_order ?? 0, is_active ?? true, id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    const oldM = oldMaster.rows[0] || {}
    const newM = { value: value.trim(), description: description?.trim() || null, sort_order: sort_order ?? 0, is_active: is_active ?? true }
    const changedM = Object.keys(newM).filter(k => String(oldM[k] ?? '') !== String(newM[k] ?? ''))
    const metaM = changedM.length ? { old: Object.fromEntries(changedM.map(k => [k, oldM[k]])), new: Object.fromEntries(changedM.map(k => [k, newM[k]])) } : null
    await writeAudit(req.user.id, 'Master Updated', 'Masters', `${r.rows[0].type}: "${oldM.value}" → "${value}"`, req.ip, metaM)
    res.json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This value already exists' })
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/api/asset-masters/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const r = await pool.query(
      `UPDATE asset_masters SET is_active=false WHERE id=$1 RETURNING id, value, type`,
      [id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    await writeAudit(req.user.id, 'Master Removed', 'Masters', `${r.rows[0].type}: "${r.rows[0].value}" removed`, req.ip)
    res.status(204).send()
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// BULK UPLOAD
// ════════════════════════════════════════════════════════════

app.post('/api/assets/bulk', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const { rows } = req.body
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'No rows provided' })

    // ── Load reference data once for the whole batch ────────────
    const [plantsRes, deptsRes, mastersRes] = await Promise.all([
      pool.query('SELECT id, code, name FROM plants WHERE status=$1', ['Active']),
      pool.query('SELECT id, code, name FROM departments WHERE status=$1', ['Active']),
      pool.query(
        `SELECT type, value FROM asset_masters WHERE is_active=true AND type = ANY($1)`,
        [['category', 'asset_class', 'asset_status', 'company_code', 'cost_center']]
      ),
    ])

    const plantMap = {}
    plantsRes.rows.forEach(p => {
      plantMap[p.code.trim().toLowerCase()] = p
      plantMap[p.name.trim().toLowerCase()] = p
    })

    const deptMap = {}
    deptsRes.rows.forEach(d => {
      deptMap[d.name.trim().toLowerCase()] = d
      deptMap[d.code.trim().toLowerCase()] = d
    })

    const masterSets = {}
    mastersRes.rows.forEach(m => {
      if (!masterSets[m.type]) masterSets[m.type] = new Set()
      masterSets[m.type].add(m.value)
    })

    // Index spec by db name for O(1) access
    const F = {}
    ASSET_FIELD_SPEC.forEach(f => { F[f.db] = f })

    // Resolve a cell value from a spreadsheet row using the spec's canonical name + aliases
    function getCol(row, field) {
      const lc = s => String(s || '').toLowerCase().trim()
      for (const key of Object.keys(row)) {
        if (lc(key) === lc(field.col) || field.aliases.some(a => a === lc(key)))
          return String(row[key] ?? '').trim()
      }
      return ''
    }

    function parseDate(raw, fieldLabel, rowErrs) {
      if (!raw) return null
      const iso  = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (iso) return raw

      // Slash-separated: could be DD/MM/YYYY, M/D/YYYY, M/D/YY, or D/M/YY
      const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
      if (slash) {
        let [, a, b, y] = slash
        const yr = y.length === 2 ? 2000 + parseInt(y) : parseInt(y)
        const av = parseInt(a), bv = parseInt(b)
        let mm, dd
        if (bv > 12) {
          // b is definitely the day → M/D format (Excel US locale)
          mm = String(av).padStart(2, '0')
          dd = String(bv).padStart(2, '0')
        } else {
          // a > 12 means it's DD/MM; otherwise assume DD/MM (system standard)
          dd = String(av).padStart(2, '0')
          mm = String(bv).padStart(2, '0')
        }
        return `${yr}-${mm}-${dd}`
      }

      rowErrs.push({ field: fieldLabel, error: `"${raw}" must be DD/MM/YYYY` })
      return null
    }

    // Validate one spreadsheet row; return { rowErrs, parsed }
    function validateRow(raw) {
      const rowErrs = []

      // Required presence for every spec field except the ones with dedicated validators below
      for (const field of ASSET_FIELD_SPEC) {
        if (!field.required) continue
        if (field.type === 'plant' || field.type === 'department') continue
        if (field.db === 'sub_sequence') continue   // validated specifically (avoids double error)
        const val = getCol(raw, field)
        if (!val) rowErrs.push({ field: field.col, error: `${field.label} is required` })
      }

      // Sub Asset Number: required integer >= 0
      const subRaw = getCol(raw, F.sub_sequence)
      const subSeq = parseInt(subRaw, 10)
      if (!subRaw) {
        rowErrs.push({ field: 'Sub Asset Number', error: 'Sub Asset Number is required' })
      } else if (isNaN(subSeq) || subSeq < 0) {
        rowErrs.push({ field: 'Sub Asset Number', error: `"${subRaw}" must be 0 or a positive integer` })
      }

      // Acquisition Value: required, numeric, non-negative
      const valueRaw = getCol(raw, F.acquisition_value)
      let acqValue = null
      if (valueRaw) {
        const cleaned = valueRaw.replace(/[,₹$]/g, '')
        if (isNaN(Number(cleaned))) {
          rowErrs.push({ field: 'Acquisition Value', error: `"${valueRaw}" is not a valid number` })
        } else {
          acqValue = parseFloat(cleaned)
          if (acqValue < 0) rowErrs.push({ field: 'Acquisition Value', error: 'Cannot be negative' })
        }
      }

      // Status enum
      const statusRaw = getCol(raw, F.status)
      if (statusRaw && !['active', 'inactive'].includes(statusRaw.toLowerCase()))
        rowErrs.push({ field: 'Status', error: `Must be Active or Inactive (got "${statusRaw}")` })

      // Masters: category, asset_class, asset_status, company_code, cost_center
      for (const field of ASSET_FIELD_SPEC.filter(f => f.master)) {
        const val = getCol(raw, field)
        if (!val) continue  // already caught by required check above
        if (!masterSets[field.master]?.has(val))
          rowErrs.push({ field: field.col, error: `"${val}" not found in ${field.label} masters` })
      }

      // Business Area Code → plant_id (code lookup)
      const bizArea = getCol(raw, F.plant_id)
      let plantId = null
      if (!bizArea) {
        rowErrs.push({ field: 'Business Area Code', error: 'Business Area Code is required' })
      } else {
        const matched = plantMap[bizArea.toLowerCase()]
        if (!matched) {
          const hint = plantsRes.rows.map(p => `${p.code} (${p.name})`).join(', ')
          rowErrs.push({ field: 'Business Area Code', error: `"${bizArea}" not found. Valid: ${hint || 'none — add plants first'}` })
        } else {
          plantId = matched.id
        }
      }

      // Department → dept_id (name or code lookup)
      const deptName = getCol(raw, F.dept_id)
      let deptId = null
      if (!deptName) {
        rowErrs.push({ field: 'Department', error: 'Department is required' })
      } else {
        const matched = deptMap[deptName.toLowerCase()]
        if (!matched) {
          const hint = deptsRes.rows.map(d => d.name).join(', ')
          rowErrs.push({ field: 'Department', error: `"${deptName}" not found. Valid: ${hint || 'none — add departments first'}` })
        } else {
          deptId = matched.id
        }
      }

      // Dates
      const dopRaw = getCol(raw, F.date_of_purchase)
      const warRaw = getCol(raw, F.warranty_date)
      const dop      = parseDate(dopRaw, 'Capitalized On', rowErrs)
      const warranty = parseDate(warRaw, 'Warranty Date', rowErrs)

      return {
        rowErrs,
        parsed: {
          assetCode:    getCol(raw, F.asset_code),
          subSeq:       isNaN(subSeq) ? -1 : subSeq,
          assetName:    getCol(raw, F.name),
          serial:       getCol(raw, F.serial_number) || null,
          acqValue,
          category:     getCol(raw, F.category),
          assetClass:   getCol(raw, F.asset_class),
          assetStatus:  getCol(raw, F.asset_status),
          companyCode:  getCol(raw, F.company_code),
          costCenter:   getCol(raw, F.cost_center),
          refInvoice:   getCol(raw, F.reference_invoice_no),
          fiscalYear:   getCol(raw, F.fiscal_year),
          supplierName: getCol(raw, F.supplier_name),
          make:         getCol(raw, F.make) || null,
          employee:     getCol(raw, F.assigned_employee),
          note:         getCol(raw, F.notes) || null,
          plantId, deptId,
          status: statusRaw
            ? statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase()
            : 'Active',
          dop, warranty,
        }
      }
    }

    // Shared INSERT (roots use subSeq=0/parentId=null; children supply both)
    const INSERT_SQL = `
      INSERT INTO assets (
        asset_code, sub_sequence, parent_asset_id,
        name, serial_number, acquisition_value,
        category, asset_class, company_code, cost_center,
        reference_invoice_no, fiscal_year, supplier_name,
        assigned_employee, make, asset_status,
        date_of_purchase, warranty_date, notes,
        plant_id, dept_id, status,
        created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW())
      RETURNING id`

    const insertParams = (p, subSeq, parentId) => [
      p.assetCode, subSeq, parentId,
      p.assetName, p.serial, p.acqValue,
      p.category, p.assetClass, p.companyCode, p.costCenter,
      p.refInvoice, p.fiscalYear, p.supplierName,
      p.employee, p.make, p.assetStatus,
      p.dop, p.warranty, p.note,
      p.plantId, p.deptId, p.status,
    ]

    const errors        = []
    const validRoots    = []
    const validChildren = []
    const fileKeys      = new Map()   // "assetCode|subSeq" → first rowNum that claimed it

    // ── Validation loop (all rows, read-only — no DB writes yet) ─
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const { rowErrs, parsed } = validateRow(rows[i])
      if (rowErrs.length) {
        rowErrs.forEach(e => errors.push({ row: rowNum, ...e }))
        continue
      }

      // In-file duplicate: same Asset Code + Sub Asset Number claimed twice
      const key = `${parsed.assetCode}|${parsed.subSeq}`
      if (fileKeys.has(key)) {
        errors.push({
          row: rowNum,
          field: 'Asset Code',
          error: `Asset Code '${parsed.assetCode}' with Sub Asset Number ${parsed.subSeq} appears more than once in this file (first at row ${fileKeys.get(key)})`
        })
        continue
      }
      fileKeys.set(key, rowNum)

      if (parsed.subSeq === 0) validRoots.push({ rowNum, parsed })
      else                     validChildren.push({ rowNum, parsed })
    }

    // ── Cross-check every asset_code in the file against the DB in one query ─
    const allValid   = [...validRoots, ...validChildren]
    const fileCodes   = [...new Set(allValid.map(r => r.parsed.assetCode))]
    const existingRes = fileCodes.length
      ? await pool.query('SELECT asset_code, sub_sequence, id FROM assets WHERE asset_code = ANY($1)', [fileCodes])
      : { rows: [] }

    const existingRootIds = {}        // asset_code → id (only when a sub_sequence=0 row exists)
    const existingKeySet   = new Set() // "assetCode|subSeq"
    existingRes.rows.forEach(r => {
      existingKeySet.add(`${r.asset_code}|${r.sub_sequence}`)
      if (r.sub_sequence === 0) existingRootIds[r.asset_code] = r.id
    })

    for (const { rowNum, parsed } of allValid) {
      const key = `${parsed.assetCode}|${parsed.subSeq}`
      if (existingKeySet.has(key)) {
        errors.push({
          row: rowNum,
          field: 'Asset Code',
          error: `"${parsed.assetCode}" with Sub Asset Number ${parsed.subSeq} already exists in the system`
        })
      }
    }

    // Root existence check for children: must exist in this file OR already in the DB
    const fileRootCodes = new Set(validRoots.map(r => r.parsed.assetCode))
    for (const { rowNum, parsed } of validChildren) {
      if (!fileRootCodes.has(parsed.assetCode) && !existingRootIds[parsed.assetCode]) {
        errors.push({
          row: rowNum,
          field: 'Sub Asset Number',
          error: `Asset Code '${parsed.assetCode}' has no root record (Sub Asset Number 0) — add it in this file or create it first.`
        })
      }
    }

    // ── All-or-nothing: any error anywhere blocks the entire file ─
    if (errors.length > 0) {
      return res.json({
        total: rows.length,
        valid: 0,
        errors: errors.length,
        errorRows: errors,
        message: 'No rows were imported — imports are all-or-nothing. Fix the errors below and re-upload the full file.'
      })
    }

    // ── Every row is clean — insert all of them in one transaction ─
    const client = await pool.connect()
    let inserted = 0
    try {
      await client.query('BEGIN')
      const inFileRootMap = {}

      for (const { parsed } of validRoots) {
        const ins = await client.query(INSERT_SQL, insertParams(parsed, 0, null))
        inFileRootMap[parsed.assetCode] = ins.rows[0].id
        inserted++
      }

      for (const { parsed } of validChildren) {
        const parentId = inFileRootMap[parsed.assetCode] || existingRootIds[parsed.assetCode]
        await client.query(INSERT_SQL, insertParams(parsed, parsed.subSeq, parentId))
        inserted++
      }

      await client.query('COMMIT')
    } catch (dbErr) {
      await client.query('ROLLBACK')
      console.error('Bulk upload transaction rolled back:', dbErr)
      client.release()
      return res.status(500).json({ error: `Import failed and was fully rolled back: ${dbErr.message}` })
    }
    client.release()

    await writeAudit(req.user.id, 'Bulk Upload', 'Assets',
      `${inserted} imported (atomic), 0 errors from ${rows.length} rows`, req.ip)

    res.json({ total: rows.length, valid: inserted, errors: 0, errorRows: [] })
  } catch (err) {
    console.error('Bulk upload error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════

app.get('/api/reports/assets', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        a.id,
        a.asset_code,
        a.sub_sequence,
        a.asset_code || ' ' || a.sub_sequence  AS sub_asset_code,
        a.name,
        a.serial_number,
        a.acquisition_value,
        a.category,
        a.asset_class,
        a.company_code,
        a.cost_center,
        ccm.description                         AS cost_center_description,
        a.assigned_employee,
        a.make,
        a.supplier_name,
        a.reference_invoice_no,
        a.fiscal_year,
        a.asset_status,
        a.notes,
        a.status,
        a.date_of_purchase,
        a.warranty_date,
        a.created_at,
        a.updated_at,
        p.name  AS plant_name,
        p.code  AS plant_code,
        d.name  AS dept_name,
        u.name  AS employee_name
      FROM assets a
      LEFT JOIN plants p         ON a.plant_id        = p.id
      LEFT JOIN departments d    ON a.dept_id          = d.id
      LEFT JOIN users u          ON a.assigned_user_id = u.id
      LEFT JOIN asset_masters ccm ON ccm.type = 'cost_center' AND ccm.value = a.cost_center
      ORDER BY a.created_at DESC
    `)
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.get('/api/reports/transfers', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const transfers = await pool.query(`
      SELECT
        t.id, t.transfer_code, t.challan_no, t.transfer_type, t.status,
        t.notes, t.dept_head_email, t.manager_email, t.expected_return_date,
        t.approval_stage, t.dept_head_approved_at,
        t.approved_at, t.approved_by_name,
        t.created_at,
        fp.name AS from_plant_name, fp.code AS from_plant_code,
        tp.name AS to_plant_name,   tp.code AS to_plant_code,
        u.name  AS initiated_by_name,
        COUNT(DISTINCT ti.id)::int         AS asset_count,
        COUNT(DISTINCT tr.id)::int         AS return_count,
        MAX(tr.created_at)                 AS last_return_at
      FROM transfers t
      LEFT JOIN plants fp         ON t.from_plant_id = fp.id
      LEFT JOIN plants tp         ON t.to_plant_id   = tp.id
      LEFT JOIN users u           ON t.initiated_by  = u.id
      LEFT JOIN transfer_items ti ON ti.transfer_id  = t.id
      LEFT JOIN transfer_returns tr ON tr.transfer_id = t.id
      GROUP BY t.id, fp.id, tp.id, u.id
      ORDER BY t.created_at DESC
    `)

    const items = await pool.query(`
      SELECT
        ti.transfer_id,
        a.asset_code, a.asset_code AS asset_tag, a.name, a.category, a.asset_class,
        a.serial_number, a.serial_number AS serial, a.acquisition_value, a.acquisition_value AS value,
        a.assigned_employee, a.sub_sequence,
        d.name AS dept_name
      FROM transfer_items ti
      JOIN assets a ON ti.asset_id = a.id
      LEFT JOIN departments d ON a.dept_id = d.id
      ORDER BY a.asset_code
    `)

    const returns = await pool.query(`
      SELECT
        r.transfer_id, r.id AS return_id, r.return_code, r.challan_no,
        r.return_date, r.returned_by, r.notes, r.status,
        r.dept_head_email, r.manager_email, r.approval_stage, r.dept_head_approved_at,
        r.approval_status, r.approved_at, r.approved_by_name,
        COUNT(ri.id)::int AS returned_asset_count
      FROM transfer_returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `)

    const enrichedTransfers = await Promise.all(transfers.rows.map(async t => ({
      ...t,
      approved_by_name: await getTransferApprovedByName(t)
    })))

    const enrichedReturns = await Promise.all(returns.rows.map(async r => ({
      ...r,
      approved_by_name: await getReturnApprovedByName(r)
    })))

    const itemsByTransfer   = {}
    const returnsByTransfer = {}
    items.rows.forEach(i   => { (itemsByTransfer[i.transfer_id]   ||= []).push(i) })
    enrichedReturns.forEach(r => { (returnsByTransfer[r.transfer_id] ||= []).push(r) })

    const result = enrichedTransfers.map(t => ({
      ...t,
      items:   itemsByTransfer[t.id]   || [],
      returns: returnsByTransfer[t.id] || [],
    }))

    res.json(result)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════

app.get('/api/audit-logs', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT l.id, l.action, l.module, l.details, l.ip_address, l.created_at, l.meta,
             u.name AS user_name
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC LIMIT 500
    `)
    res.json(r.rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ════════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const [assets, value, transfers, plants] = await Promise.all([
      pool.query("SELECT COUNT(*)::int FROM assets"),
      pool.query("SELECT COALESCE(SUM(acquisition_value),0)::numeric FROM assets"),
      pool.query("SELECT COUNT(*)::int FROM transfers WHERE status='Pending Approval'"),
      pool.query("SELECT COUNT(*)::int FROM plants WHERE status='Active'"),
    ])
    res.json({
      totalAssets:      assets.rows[0].count,
      totalValue:       parseFloat(value.rows[0].coalesce),
      pendingTransfers: transfers.rows[0].count,
      activePlants:     plants.rows[0].count,
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// CHALLAN SETTINGS — plant-based numbering pattern + printed boilerplate
// ════════════════════════════════════════════════════════════

app.get('/api/challan-settings', authMiddleware, async (req, res) => {
  try {
    res.json(await getChallanSettings())
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// Accept only genuine embedded images (data URIs) for the signature/logo, to
// prevent stuffing arbitrary/script URLs into the printed challan's <img src>.
function validImageDataUri(v) {
  if (v == null || v === '') return true                       // empty = cleared
  if (typeof v !== 'string') return false
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return false
  if (v.length > 3_000_000) return false                       // ~2MB cap
  return true
}

app.put('/api/challan-settings', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const {
      delivery_doc_type, return_doc_type, seq_padding, footer_note, signatory_label,
      template_enabled, signature_image, template,
    } = req.body
    if (!delivery_doc_type?.trim()) return res.status(400).json({ error: 'Delivery doc type is required' })
    if (!return_doc_type?.trim())   return res.status(400).json({ error: 'Return doc type is required' })
    if (!signatory_label?.trim())   return res.status(400).json({ error: 'Signatory label is required' })
    const padding = parseInt(seq_padding)
    if (!Number.isInteger(padding) || padding < 1 || padding > 6)
      return res.status(400).json({ error: 'Sequence padding must be between 1 and 6' })
    if (!validImageDataUri(signature_image))
      return res.status(400).json({ error: 'Signature must be a PNG/JPG/GIF/WebP image under 2 MB' })

    // Validate the visual-template blob: a plain object; validate any embedded logo image.
    const tpl = (template && typeof template === 'object' && !Array.isArray(template)) ? template : {}
    if (!validImageDataUri(tpl.logoImage))
      return res.status(400).json({ error: 'Logo must be a PNG/JPG/GIF/WebP image under 2 MB' })

    const r = await pool.query(
      `UPDATE challan_settings
       SET delivery_doc_type=$1, return_doc_type=$2, seq_padding=$3, footer_note=$4, signatory_label=$5,
           template_enabled=$6, signature_image=$7, template=$8
       WHERE id=1 RETURNING *`,
      [delivery_doc_type.trim().toUpperCase(), return_doc_type.trim().toUpperCase(),
       padding, stripTags(footer_note) || '', signatory_label.trim(),
       !!template_enabled, signature_image || null, JSON.stringify(tpl)]
    )
    await writeAudit(req.user.id, 'Challan Settings Updated', 'System', 'Challan numbering/template settings updated', req.ip)
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ════════════════════════════════════════════════════════════
// ROLE PERMISSIONS
// ════════════════════════════════════════════════════════════

app.get('/api/role-permissions', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('SELECT role, page, access FROM role_permissions ORDER BY role, page')
    const result = {}
    for (const row of r.rows) {
      if (!result[row.role]) result[row.role] = {}
      result[row.role][row.page] = row.access
    }
    res.json(result)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

app.put('/api/role-permissions', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { permissions } = req.body
    if (!permissions || typeof permissions !== 'object')
      return res.status(400).json({ error: 'Invalid permissions payload' })

    for (const [role, pages] of Object.entries(permissions)) {
      if (role === 'Admin') continue
      if (!['Manager', 'User'].includes(role)) continue
      for (const [page, access] of Object.entries(pages)) {
        if (!['true', 'view', 'false'].includes(String(access))) continue
        await pool.query(
          `INSERT INTO role_permissions (role, page, access, updated_at)
           VALUES ($1,$2,$3,NOW())
           ON CONFLICT (role, page) DO UPDATE SET access = EXCLUDED.access, updated_at = NOW()`,
          [role, page, String(access)]
        )
      }
    }
    await writeAudit(req.user.id, 'Permissions Updated', 'System', 'Role permissions updated by admin', req.ip)
    res.json({ message: 'Permissions saved successfully' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
})

// ============================================================

// ── Global error handler — never leak stack traces / internal paths ──
// Catches malformed-JSON body errors and any unhandled route errors.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError))
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  if (err && err.type === 'entity.too.large')
    return res.status(413).json({ error: 'Request body too large' })
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`)
});

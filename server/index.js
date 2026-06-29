const express = require('express')
const cors    = require('cors')
const pool    = require('./db')
const bcrypt  = require('bcrypt')
const jwt     = require('jsonwebtoken')
require('dotenv').config()
const { sendHtml, buildApprovalEmail, buildReturnApprovalEmail, buildApprovalResultHtml, buildChallanTable } = require('./emailService')
const crypto = require('crypto')
const ASSET_FIELD_SPEC = require('./assetFieldSpec')

const app        = express()
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const JWT_SECRET = process.env.JWT_SECRET || 'assethub_secret_key'
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
      ['Manager','users','view'],['Manager','audit-logs','false'],
      ['User','dashboard','true'],['User','assets','view'],['User','bulk-upload','false'],
      ['User','transfer','view'],['User','plants','false'],['User','departments','false'],
      ['User','masters','false'],['User','email-masters','false'],['User','reports','false'],
      ['User','users','false'],['User','audit-logs','false'],
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
 

app.use(cors({
  origin: [
    "http://localhost:8080",
    "http://192.168.109.92:8080",
    "http://192.168.24.15:8080"
  ],
  credentials: true
}));
 
// ── Auth middleware ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'No token provided' })
  const token = header.split(' ')[1]
  try {
    req.user = jwt.verify(token, JWT_SECRET)
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
 
app.post('/api/auth/login', async (req, res) => {
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
 
    let valid = false
    if (user.password_hash?.startsWith('$2b') || user.password_hash?.startsWith('$2a')) {
      valid = await bcrypt.compare(password, user.password_hash)
    } else {
      valid = (password === user.password_hash)
    }
 
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
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, employee_id: user.employee_id, must_change_password: user.must_change_password}
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: err.message })
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body

    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Current and new password are required' })

    if (new_password.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' })

    // Fetch current hash
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!result.rows.length)
      return res.status(404).json({ error: 'User not found' })

    const user = result.rows[0]

    // Verify current password
    let valid = false
    if (user.password_hash?.startsWith('$2b') || user.password_hash?.startsWith('$2a')) {
      valid = await bcrypt.compare(current_password, user.password_hash)
    } else {
      valid = (current_password === user.password_hash)
    }

    if (!valid)
      return res.status(401).json({ error: 'Current password is incorrect' })

    // Hash new password and clear the force-change flag
    const hashed = await bcrypt.hash(new_password, 10)
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hashed, req.user.id]
    )

    await writeAudit(req.user.id, 'Password Changed', 'Auth', `${user.name} changed their password`, req.ip)
    res.json({ message: 'Password changed successfully' })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Admin: reset another user's password ────────────────────
app.put('/api/users/:id/reset-password', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { new_password } = req.body

    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const hashed = await bcrypt.hash(new_password, 10)

    // Set new password AND force change on next login
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = true
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
    res.status(500).json({ error: err.message })
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/assets/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const r = await pool.query('DELETE FROM assets WHERE id=$1 RETURNING id, asset_code', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' })
    await writeAudit(req.user.id, 'Asset Deleted', 'Assets', `Asset ${r.rows[0].asset_code} deleted`, req.ip)
    res.status(204).send()
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
// ════════════════════════════════════════════════════════════
// PLANTS
// ════════════════════════════════════════════════════════════
 
app.get('/api/plants', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.id, p.code, p.name, p.location, p.head, p.status, p.created_at,
             COUNT(a.id)::int AS asset_count
      FROM plants p LEFT JOIN assets a ON a.plant_id = p.id
      GROUP BY p.id ORDER BY p.name ASC
    `)
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.post('/api/plants', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { code, name, location, head, status } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })
    const r = await pool.query(
      `INSERT INTO plants (code,name,location,head,status,created_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [code.trim(), name.trim(), location||null, head||null, status||'Active']
    )
    await writeAudit(req.user.id, 'Plant Added', 'Masters', `Plant ${name} added`, req.ip)
    res.status(201).json({ ...r.rows[0], asset_count: 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.put('/api/plants/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { code, name, location, head, status } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })
    const r = await pool.query(
      `UPDATE plants SET code=$1,name=$2,location=$3,head=$4,status=$5 WHERE id=$6 RETURNING *`,
      [code.trim(), name.trim(), location||null, head||null, status||'Active', id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Plant not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.delete('/api/plants/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const check = await pool.query('SELECT COUNT(*) FROM assets WHERE plant_id=$1', [id])
    if (parseInt(check.rows[0].count) > 0)
      return res.status(400).json({ error: 'Cannot delete plant with assigned assets' })
    await pool.query('DELETE FROM plants WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.post('/api/departments', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { code, name, plant_id, manager, status } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })
    const r = await pool.query(
      `INSERT INTO departments (code,name,plant_id,manager,status,created_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [code.trim(), name.trim(), plant_id||null, manager||null, status||'Active']
    )
    await writeAudit(req.user.id, 'Department Added', 'Masters', `Dept ${name} added`, req.ip)
    res.status(201).json({ ...r.rows[0], asset_count: 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.put('/api/departments/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { code, name, plant_id, manager, status } = req.body
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: 'Code and name required' })
    const r = await pool.query(
      `UPDATE departments SET code=$1,name=$2,plant_id=$3,manager=$4,status=$5 WHERE id=$6 RETURNING *`,
      [code.trim(), name.trim(), plant_id||null, manager||null, status||'Active', id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Department not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.delete('/api/departments/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const check = await pool.query('SELECT COUNT(*) FROM assets WHERE dept_id=$1', [id])
    if (parseInt(check.rows[0].count) > 0)
      return res.status(400).json({ error: 'Cannot delete department with assigned assets' })
    await pool.query('DELETE FROM departments WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { res.status(500).json({ error: err.message }) }
})

 function mapPgError(err) {
  if (err.code === '23505') {
    const constraint = err.constraint || ''
    if (constraint.includes('employee_id')) return 'Employee ID already exists'
    if (constraint.includes('username'))    return 'Username already exists'
    if (constraint.includes('email'))       return 'Email already exists'
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, employee_id, username, name, email, role, status FROM users WHERE id=$1',
      [req.params.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})
 
app.post('/api/users', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { employee_id, username, name, email, password_hash, password, role, status } = req.body

    // ── Field validation (clean messages, no DB involved yet) ──
    if (!employee_id?.trim()) return res.status(400).json({ error: 'Employee ID is required' })
    if (!username?.trim())    return res.status(400).json({ error: 'Username is required' })
    if (!name?.trim())        return res.status(400).json({ error: 'Full name is required' })
    if (!email?.trim())       return res.status(400).json({ error: 'Email is required' })

    const raw    = password_hash || password || 'changeme123'
    const hashed = raw.startsWith('$2b') ? raw : await bcrypt.hash(raw, 10)

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

// ════════════════════════════════════════════════════════════
// EMAIL MASTERS
// ════════════════════════════════════════════════════════════

app.get('/api/email-masters', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM email_masters WHERE is_active=true ORDER BY name ASC'
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/email-masters', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, department } = req.body
    if (!name?.trim() || !email?.trim())
      return res.status(400).json({ error: 'Name and email are required' })
    const r = await pool.query(
      `INSERT INTO email_masters (name, email, department, is_active, created_at)
       VALUES ($1,$2,$3,true,NOW()) RETURNING *`,
      [name.trim(), email.trim(), department?.trim()||null]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' })
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/email-masters/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, department, is_active } = req.body
    if (!name?.trim() || !email?.trim())
      return res.status(400).json({ error: 'Name and email are required' })
    const r = await pool.query(
      `UPDATE email_masters SET name=$1, email=$2, department=$3, is_active=$4 WHERE id=$5 RETURNING *`,
      [name.trim(), email.trim(), department?.trim()||null, is_active??true, id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/email-masters/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE email_masters SET is_active=false WHERE id=$1', [id])
    res.status(204).send()
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ════════════════════════════════════════════════════════════
// TRANSFERS
// ════════════════════════════════════════════════════════════

// ── GET /api/transfers — list with stats ─────────────────────
app.get('/api/transfers', authMiddleware, async (req, res) => {
  try {
    const transfers = await pool.query(`
      SELECT
        t.id, t.transfer_code, t.transfer_type, t.status,
        t.notes, t.manager_email, t.expected_return_date,
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

    res.json({ transfers: transfers.rows, stats: stats.rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
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
        a.asset_code AS asset_tag, a.name, a.category, a.asset_class,
        a.serial_number AS serial, a.acquisition_value AS value,
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
    r.id, r.return_code, r.return_date, r.returned_by,
    r.notes, r.status, r.created_at,
    r.approval_status, r.manager_email,
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
        a.asset_code AS asset_tag, a.name
      FROM return_items ri
      JOIN assets a ON ri.asset_id = a.id
      WHERE ri.return_id = ANY(
        SELECT id FROM transfer_returns WHERE transfer_id = $1
      )`, [id])

    // Attach return items to returns
    const returnsWithItems = returns.rows.map(r => ({
      ...r,
      items: returnItemsRaw.rows.filter(ri => ri.return_id === r.id)
    }))

    res.json({
      ...tr.rows[0],
      items:   items.rows,
      returns: returnsWithItems,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/transfers — create transfer + send approval email
app.post('/api/transfers', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { from_plant_id, to_plant_id, transfer_type, asset_ids, manager_email, notes, expected_return_date } = req.body

    if (!from_plant_id || !to_plant_id)
      return res.status(400).json({ error: 'Source and destination plants are required' })
    if (!asset_ids?.length)
      return res.status(400).json({ error: 'Select at least one asset' })
    if (!manager_email)
      return res.status(400).json({ error: 'Manager email is required for approval' })
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

    // Create transfer
    const tr = await pool.query(
      `INSERT INTO transfers
       (transfer_code, from_plant_id, to_plant_id, transfer_type, status,
        notes, manager_email, approval_token, approval_token_expires,
        expected_return_date, initiated_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'Pending Approval',$5,$6,$7,$8,$9,$10,NOW(),NOW())
       RETURNING *`,
      [transferCode, from_plant_id, to_plant_id,
       transfer_type||'Returnable',
       notes||null, manager_email, token, tokenExpiry,
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
      const result = await sendHtml(manager_email, `Approval Required: Asset Transfer ${transferCode}`, emailHtml)
      if (!result.skipped) {
        emailSent = true
        console.log(`✓ Approval email successfully sent to ${manager_email}`)
      } else {
        emailWarning = result.warning || 'Email service not configured'
        console.warn(`⚠️  Email skipped: ${emailWarning}`)
      }
    } catch (emailErr) {
      console.error('✗ Email send failed:', emailErr.message)
      emailWarning = `Email delivery failed: ${emailErr.message}`
      // Still create the transfer, but log the warning
      await writeAudit(req.user.id, 'Transfer Created (Email Failed)', 'Transfer',
        `${transferCode}: Email to ${manager_email} failed - ${emailErr.message}`, req.ip)
    }

    if (emailSent) {
      await writeAudit(req.user.id, 'Transfer Created & Emailed', 'Transfer',
        `${transferCode}: ${asset_ids.length} assets, approval email sent to ${manager_email}`, req.ip)
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
    res.status(500).json({ error: err.message })
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

    // Approve: update transfer status + move asset plant_id to destination
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

    await writeAudit(null, 'Transfer Rejected', 'Transfer',
      `${transfer.transfer_code} rejected via email`, '0.0.0.0')
    await createNotification('transfer_rejected',
      `${transfer.transfer_code} is rejected by the manager of ${transfer.manager_email}`,
      transfer.transfer_code, transfer.id)

    res.send(buildApprovalResultHtml(false, transfer.transfer_code, reason || 'Rejected.'))
  } catch (err) {
    console.error('Reject error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})

// ── PUT /api/transfers/:id/complete — mark physically dispatched
// Call this when assets physically reach destination
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/transfers/:id/return — NOW SENDS APPROVAL EMAIL ──
// Instead of completing instantly, this creates a return in
// "Pending Approval" status and emails the same manager_email
// (or the one passed in) for approval.
app.post('/api/transfers/:id/return', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
  try {
    const { id } = req.params
    const { asset_ids, returned_by, return_date, notes, manager_email } = req.body

    if (!asset_ids?.length)
      return res.status(400).json({ error: 'Select at least one asset to return' })

    const tr = await pool.query('SELECT * FROM transfers WHERE id=$1', [id])
    if (!tr.rows.length) return res.status(404).json({ error: 'Transfer not found' })

    const transfer = tr.rows[0]
    if (!['Completed','Partially Returned'].includes(transfer.status))
      return res.status(400).json({ error: 'Transfer must be Completed to process returns' })
    if (transfer.transfer_type !== 'Returnable')
      return res.status(400).json({ error: 'Only Returnable transfers can have returns' })

    const returnEmail = manager_email || transfer.manager_email
    if (!returnEmail)
      return res.status(400).json({ error: 'Manager email is required for return approval' })

    // Get all assets in this transfer
    const allItems = await pool.query(
      'SELECT asset_id FROM transfer_items WHERE transfer_id=$1', [id])
    const allAssetIds = allItems.rows.map(r => r.asset_id)

    const invalid = asset_ids.filter(aid => !allAssetIds.includes(aid))
    if (invalid.length)
      return res.status(400).json({ error: `Asset IDs not in this transfer: ${invalid.join(', ')}` })

    // Check not already returned or pending return
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

    // Determine if this will be a full or partial return (once approved)
    const returnedSoFarR = await pool.query(`
      SELECT COUNT(DISTINCT ri.asset_id)::int AS cnt
      FROM return_items ri
      JOIN transfer_returns tr2 ON ri.return_id = tr2.id
      WHERE tr2.transfer_id = $1 AND tr2.approval_status='Approved'`, [id])
    const returnedSoFar   = returnedSoFarR.rows[0].cnt
    const totalInTransfer = allAssetIds.length
    const wouldBeFullAfterThis = (returnedSoFar + asset_ids.length) >= totalInTransfer

    // Create return record — PENDING APPROVAL (not yet moved)
    const ret = await pool.query(
      `INSERT INTO transfer_returns
       (return_code, transfer_id, return_date, returned_by, notes,
        status, approval_status, manager_email, approval_token, approval_token_expires, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Pending Approval',$7,$8,$9,NOW()) RETURNING *`,
      [returnCode, id, return_date||new Date().toISOString().split('T')[0],
       returned_by||req.user.name, notes||null,
       wouldBeFullAfterThis ? 'Completed' : 'Partial',
       returnEmail, token, tokenExpiry]
    )
    const transferReturn = ret.rows[0]

    // Insert return items (linked but assets NOT moved yet)
    for (const asset_id of asset_ids) {
      await pool.query(
        'INSERT INTO return_items (return_id, asset_id) VALUES ($1,$2)',
        [transferReturn.id, asset_id]
      )
    }

    // Mark assets as Pending Transfer (locked) while return is pending approval
    await pool.query(
      `UPDATE assets SET status='Pending Transfer', updated_at=NOW() WHERE id=ANY($1::int[])`,
      [asset_ids]
    )

    // Build & send return approval email
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
      await sendHtml(returnEmail, `Approval Required: Asset Return ${returnCode}`, emailHtml)
    } catch (emailErr) {
      console.error('Return email send failed:', emailErr.message)
      emailWarning = `Email could not be sent: ${emailErr.message}`
    }

    await writeAudit(req.user.id, 'Return Initiated', 'Transfer',
      `${returnCode}: ${asset_ids.length} asset(s) pending return approval for ${transfer.transfer_code}`, req.ip)

    res.status(201).json({
      ...transferReturn,
      asset_count: asset_ids.length,
      email_warning: emailWarning,
    })
  } catch (err) {
    console.error('Return create error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/transfer-returns/:id/approve?token=xxx ───────────
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

    // Mark return approved
    await pool.query(
      `UPDATE transfer_returns
       SET approval_status='Approved', approved_at=NOW(), approved_by_name='Email Approval', approval_token=NULL
       WHERE id=$1`, [id])

    // Get assets in this return
    const items = await pool.query('SELECT asset_id FROM return_items WHERE return_id=$1', [id])
    const assetIds = items.rows.map(r => r.asset_id)

    // Move assets back to original (from) plant
    if (assetIds.length) {
      await pool.query(
        `UPDATE assets SET plant_id=$1, status='Active', updated_at=NOW() WHERE id=ANY($2::int[])`,
        [transfer.from_plant_id, assetIds]
      )
    }

    // Update transfer status based on whether this completes it
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

// ── GET /api/transfer-returns/:id/reject?token=xxx ─────────────
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

    // Restore assets to Active (still at the "to" plant — return didn't happen)
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
      `${ret.return_code} is rejected by the manager of ${ret.manager_email}`,
      ret.return_code, ret.transfer_id)

    res.send(buildApprovalResultHtml(false, ret.return_code, reason || 'Rejected.', 'Return'))
  } catch (err) {
    console.error('Return reject error:', err)
    res.status(500).send('<p>Server error. Please contact admin.</p>')
  }
})


// ── POST /api/transfers/:id/resend-approval — regenerate token & resend email ──
app.post('/api/transfers/:id/resend-approval', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
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
      await sendHtml(transfer.manager_email,
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
      `Approval email resent for ${transfer.transfer_code} to ${transfer.manager_email}`, req.ip)

    res.json({ ok: true, email_warning: emailWarning })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/transfer-returns/:id/resend-approval — regenerate token & resend email ──
app.post('/api/transfer-returns/:id/resend-approval', authMiddleware, requireRole('Admin','Manager'), async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── GET /api/notifications ────────────────────────────────────
app.get('/api/notifications', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PUT /api/notifications/read-all ──────────────────────────
app.put('/api/notifications/read-all', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read=true`)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PUT /api/notifications/:id/read ──────────────────────────
app.put('/api/notifications/:id/read', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read=true WHERE id=$1`, [req.params.id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
      const ddmm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      const iso  = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (ddmm) return `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`
      if (iso)  return raw
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

    const errors       = []
    const validRoots   = []
    const validChildren = []

    // ── Validation loop (all rows) ──────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const { rowErrs, parsed } = validateRow(rows[i])
      if (rowErrs.length) {
        rowErrs.forEach(e => errors.push({ row: rowNum, ...e }))
        continue
      }
      if (parsed.subSeq === 0) {
        validRoots.push({ rowNum, parsed })
      } else {
        validChildren.push({ rowNum, parsed })
      }
    }

    let inserted = 0
    const inFileRootMap = {}   // asset_code → db id (inserted this run OR pre-existing)
    const seenRootCodes = new Set()

    // ── Pass 1: root assets (sub_sequence = 0) ─────────────────
    for (const { rowNum, parsed } of validRoots) {
      // In-file duplicate root: only the first occurrence for each asset_code is valid
      if (seenRootCodes.has(parsed.assetCode)) {
        errors.push({
          row: rowNum,
          field: 'Asset Code',
          error: `Asset Code '${parsed.assetCode}' with Sub Asset Number 0 appears more than once in this file — only the first occurrence is imported`
        })
        continue
      }
      seenRootCodes.add(parsed.assetCode)

      // DB duplicate check on (asset_code, sub_sequence = 0)
      const dup = await pool.query(
        'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=0', [parsed.assetCode]
      )
      if (dup.rows.length) {
        inFileRootMap[parsed.assetCode] = dup.rows[0].id  // register so children in this file can link
        errors.push({ row: rowNum, field: 'Asset Code', error: `"${parsed.assetCode}" with Sub Asset Number 0 already exists — skipped` })
        continue
      }

      try {
        const ins = await pool.query(INSERT_SQL, insertParams(parsed, 0, null))
        inFileRootMap[parsed.assetCode] = ins.rows[0].id
        inserted++
      } catch (dbErr) {
        errors.push({ row: rowNum, field: 'Asset Code', error: `Insert failed for "${parsed.assetCode}": ${dbErr.message}` })
      }
    }

    // ── Pass 2: child assets (sub_sequence > 0) ────────────────
    for (const { rowNum, parsed } of validChildren) {
      // DB duplicate check on (asset_code, sub_sequence)
      const dup = await pool.query(
        'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=$2',
        [parsed.assetCode, parsed.subSeq]
      )
      if (dup.rows.length) {
        errors.push({ row: rowNum, field: 'Asset Code', error: `"${parsed.assetCode}" with Sub Asset Number ${parsed.subSeq} already exists — skipped` })
        continue
      }

      // Resolve parent: in-file map first (covers roots inserted this run), then DB
      let parentId = inFileRootMap[parsed.assetCode]
      if (!parentId) {
        const rootRes = await pool.query(
          'SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=0', [parsed.assetCode]
        )
        if (rootRes.rows.length) {
          parentId = rootRes.rows[0].id
          inFileRootMap[parsed.assetCode] = parentId  // cache for subsequent siblings
        }
      }

      if (!parentId) {
        errors.push({
          row: rowNum,
          field: 'Sub Asset Number',
          error: `Asset Code '${parsed.assetCode}' has no root record (Sub Asset Number 0) — add it first, in this file or a previous one.`
        })
        continue
      }

      try {
        await pool.query(INSERT_SQL, insertParams(parsed, parsed.subSeq, parentId))
        inserted++
      } catch (dbErr) {
        errors.push({ row: rowNum, field: 'Asset Code', error: `Insert failed for "${parsed.assetCode}" sub ${parsed.subSeq}: ${dbErr.message}` })
      }
    }

    await writeAudit(req.user.id, 'Bulk Upload', 'Assets',
      `${inserted} imported, ${errors.length} errors from ${rows.length} rows`, req.ip)

    res.json({ total: rows.length, valid: inserted, errors: errors.length, errorRows: errors })
  } catch (err) {
    console.error('Bulk upload error:', err)
    res.status(500).json({ error: err.message })
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/reports/transfers', authMiddleware, requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const transfers = await pool.query(`
      SELECT
        t.id, t.transfer_code, t.transfer_type, t.status,
        t.notes, t.manager_email, t.expected_return_date,
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
        a.asset_code AS asset_tag, a.name, a.category, a.asset_class,
        a.serial_number AS serial, a.acquisition_value AS value,
        a.assigned_employee,
        d.name AS dept_name
      FROM transfer_items ti
      JOIN assets a ON ti.asset_id = a.id
      LEFT JOIN departments d ON a.dept_id = d.id
      ORDER BY a.asset_code
    `)

    const returns = await pool.query(`
      SELECT
        r.transfer_id, r.id AS return_id, r.return_code,
        r.return_date, r.returned_by, r.notes, r.status,
        r.approval_status, r.approved_at, r.approved_by_name,
        COUNT(ri.id)::int AS returned_asset_count
      FROM transfer_returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `)

    const itemsByTransfer   = {}
    const returnsByTransfer = {}
    items.rows.forEach(i   => { (itemsByTransfer[i.transfer_id]   ||= []).push(i) })
    returns.rows.forEach(r => { (returnsByTransfer[r.transfer_id] ||= []).push(r) })

    const result = transfers.rows.map(t => ({
      ...t,
      items:   itemsByTransfer[t.id]   || [],
      returns: returnsByTransfer[t.id] || [],
    }))

    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ============================================================


app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`)
});

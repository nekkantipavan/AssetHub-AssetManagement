const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const fields = require('./assetFieldSpec')

const keyOf = (code, sub) => JSON.stringify([code, Number(sub)])
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = value => value == null ? '' : String(value).trim()
const lc = value => text(value).toLowerCase()
const MODES = ['update', 'create', 'upsert']
const MAX_ROWS = 5000

function dateValue(raw) {
  let y, m, d
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) [y, m, d] = raw.split('-').map(Number)
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) [d, m, y] = raw.split('/').map(Number)
  else throw Error('Use DD/MM/YYYY or YYYY-MM-DD')
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw Error('Invalid calendar date')
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function comparable(value, field) {
  if (value == null || value === '') return null
  if (field.type === 'date') return value instanceof Date
    ? [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
    : String(value).slice(0, 10)
  if (['numeric', 'integer', 'plant', 'department'].includes(field.type)) return Number(value)
  return String(value)
}

// The preview is recomputed on confirmation inside the same transaction as writes.
async function planImport(db, rows, mode) {
  if (!MODES.includes(mode)) throw Error('Choose update, create or upsert mode')
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) throw Error(`Provide between 1 and ${MAX_ROWS} rows`)
  const errors = [], warnings = [], plans = []
  const addError = (row, field, error) => errors.push({ row, field, error })
  const normalized = rows.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`Invalid row ${i + 2}`)
    const out = {}
    for (const field of fields) {
      const headers = Object.keys(raw).filter(h => lc(h) === lc(field.col) || field.aliases.includes(lc(h)))
      if (headers.length > 1) addError(i + 2, field.col, 'Multiple columns map to this field; keep only one')
      if (headers.length) out[field.db] = text(raw[headers[0]])
    }
    return { values: out, recordId: text(raw['Asset Record ID']), version: text(raw['Record Version']) }
  })
  const codes = [...new Set(normalized.map(r => r.values.asset_code).filter(Boolean))]
  const ids = normalized.map(r => r.recordId).filter(id => /^\d+$/.test(id))
  const existing = (await db.query('SELECT *, xmin::text AS record_version FROM assets WHERE asset_code = ANY($1::text[]) OR id::text = ANY($2::text[]) ORDER BY id', [codes, ids])).rows
  const byKey = new Map(existing.map(a => [keyOf(a.asset_code, a.sub_sequence), a]))
  const byId = new Map(existing.map(a => [String(a.id), a]))
  const plants = (await db.query('SELECT id, code, name, status FROM plants')).rows
  const departments = (await db.query('SELECT id, code, name, plant_id, status FROM departments')).rows
  const masters = (await db.query('SELECT type, value FROM asset_masters WHERE is_active=true')).rows
  const seen = new Set()
  for (let i = 0; i < normalized.length; i++) {
    const row = i + 2, { values: input, recordId, version } = normalized[i]
    const code = input.asset_code, sub = input.sub_sequence
    if (!code || code === '[CLEAR]') addError(row, 'Asset Code', 'Asset Code is required')
    if (!/^\d+$/.test(sub || '') || !Number.isSafeInteger(Number(sub)) || Number(sub) > 2147483647) addError(row, 'Sub Asset Number', 'Use a whole number from 0 to 2147483647')
    const key = keyOf(code, sub), old = byKey.get(key)
    if (seen.has(key)) addError(row, 'Asset Code', 'Duplicate Asset Code + Sub Asset Number within this file')
    seen.add(key)
    if (recordId && (!byId.has(recordId) || String(old?.id) !== recordId)) addError(row, 'Asset Record ID', 'Asset identifiers changed or record no longer exists; use a fresh export')
    if (version && !recordId) addError(row, 'Record Version', 'Keep Asset Record ID together with Record Version')
    if (recordId && !version) addError(row, 'Record Version', 'Keep Record Version from the export; export again if missing')
    if (mode === 'update' && !old) addError(row, 'Asset Code', 'Asset does not exist; Update existing cannot create records')
    if (mode === 'create' && old) addError(row, 'Asset Code', 'Asset already exists; choose Update existing or Create and update')
    const values = {}, changes = []
    for (const field of fields) {
      const raw = input[field.db], before = comparable(old?.[field.db], field)
      let after = before
      // Empty or absent cells preserve existing values; new records must supply required values.
      if (raw == null || raw === '') {
        if (!old && field.required) addError(row, field.col, 'Required for new assets')
      } else if (raw === '[CLEAR]') {
        if (field.required) addError(row, field.col, 'Required fields cannot be cleared')
        else after = null
      } else {
        try {
          after = raw
          if (field.type === 'integer') after = Number(raw)
          if (field.type === 'numeric') {
            const cleaned = raw.replace(/[,₹$]/g, '')
            if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned) || !Number.isFinite(Number(cleaned))) throw Error('Use a non-negative number')
            after = Number(cleaned)
          }
          if (field.type === 'year' && !/^\d{4}$/.test(raw)) throw Error('Use a four-digit fiscal year')
          if (field.type === 'date') after = dateValue(raw)
          if (field.type === 'enum') {
            after = field.values.find(v => lc(v) === lc(raw))
            // Workflow status may be present unchanged in an exported report.
            if (!after && old && raw === before) after = before
            if (!after) throw Error(`Use ${field.values.join(' or ')}`)
          }
          if (field.type === 'plant' || field.type === 'department') {
            const refs = field.type === 'plant' ? plants : departments
            const matches = refs.filter(r => (lc(r.code) === lc(raw) || lc(r.name) === lc(raw)) &&
              (field.type === 'plant' || r.plant_id == null || Number(r.plant_id) === Number(values.plant_id)))
            const same = old && matches.find(r => r.id === before)
            const ref = same || (matches.length === 1 ? matches[0] : null)
            if (!ref) throw Error('Not found or ambiguous for this plant; use the configured code')
            if (ref.status !== 'Active' && ref.id !== before) throw Error('Not found or inactive; configure it first')
            after = ref.id
          }
          if (field.master && raw !== before) {
            const match = masters.find(m => m.type === field.master && m.value === raw)
            if (!match) throw Error(`Value not found in ${field.label} masters (match spelling and case)`)
          }
        } catch (err) { addError(row, field.col, err.message); continue }
      }
      values[field.db] = after
      if (after !== before) changes.push({ field: field.col, db: field.db, before, after })
    }
    const action = !old ? 'create' : changes.length ? 'update' : 'unchanged'
    if (old && changes.length && version && version !== old.record_version) addError(row, 'Record Version', 'Asset changed since export; download a fresh report')
    if (old && !version) warnings.push({ row, message: 'No export version supplied: changes since export cannot be checked. Changes after this preview are still protected.' })
    if (old && changes.length) {
      const custody = ['plant_id', 'dept_id', 'assigned_employee']
      if (changes.some(c => custody.includes(c.db))) addError(row, 'Business Area Code / Department / Assigned Employee', 'Use the asset transfer workflow to change location or custody of an existing asset')
      if (!['Active', 'Inactive'].includes(old.status)) addError(row, 'Status', 'Asset is in a transfer workflow; finish or cancel the transfer before bulk editing')
    }
    plans.push({ row, key, code, sub: Number(sub), id: old?.id || null, version: old?.record_version || null, action, values, changes })
  }
  const roots = new Set([...existing.filter(a => a.sub_sequence === 0).map(a => a.asset_code), ...plans.filter(p => p.sub === 0).map(p => p.code)])
  for (const p of plans) if (p.action === 'create' && p.sub > 0 && !roots.has(p.code)) addError(p.row, 'Sub Asset Number', 'Main asset (Sub Asset Number 0) must exist or be included in this file')
  return {
    mode, total: rows.length,
    summary: { create: plans.filter(p => p.action === 'create').length, update: plans.filter(p => p.action === 'update').length, unchanged: plans.filter(p => p.action === 'unchanged').length, errors: new Set(errors.map(e => e.row)).size },
    errors, warnings, plans,
  }
}

async function saveImport(db, plan, user, ip) {
  const batchId = crypto.randomUUID()
  const rootIds = new Map((await db.query('SELECT asset_code, id FROM assets WHERE asset_code = ANY($1::text[]) AND sub_sequence=0', [[...new Set(plan.plans.map(p => p.code))]])).rows.map(a => [a.asset_code, a.id]))
  // Roots must be inserted before children, regardless of worksheet order.
  const ordered = [...plan.plans].sort((a, b) => a.sub - b.sub)
  for (const p of ordered) {
    if (p.action === 'unchanged') continue
    let id = p.id
    const columns = fields.map(f => f.db)
    if (p.action === 'create') {
      const values = columns.map(c => p.values[c])
      columns.push('parent_asset_id')
      values.push(p.sub === 0 ? null : rootIds.get(p.code))
      const result = await db.query(`INSERT INTO assets (${columns.join(',')}, created_at, updated_at) VALUES (${values.map((_, i) => `$${i + 1}`).join(',')}, NOW(), NOW()) RETURNING id`, values)
      id = result.rows[0].id
      if (p.sub === 0) rootIds.set(p.code, id)
    } else {
      const changes = p.changes.filter(c => !['asset_code', 'sub_sequence'].includes(c.db))
      await db.query(`UPDATE assets SET ${changes.map((c, i) => `${c.db}=$${i + 1}`).join(',')}, updated_at=NOW() WHERE id=$${changes.length + 1}`, [...changes.map(c => c.after), id])
    }
    const meta = { batchId, assetId: id, old: Object.fromEntries(p.changes.map(c => [c.db, c.before])), new: Object.fromEntries(p.changes.map(c => [c.db, c.after])) }
    await db.query("INSERT INTO audit_logs (user_id, action, module, details, ip_address, created_at, meta) VALUES ($1,$2,'Assets',$3,$4,NOW(),$5)", [user.id, p.action === 'create' ? 'Asset Created' : 'Asset Modified', `Bulk ${p.action}: ${p.code} / ${p.sub}`, ip, JSON.stringify(meta)])
  }
  await db.query("INSERT INTO audit_logs (user_id, action, module, details, ip_address, created_at, meta) VALUES ($1,'Bulk Upload','Assets',$2,$3,NOW(),$4)", [user.id, `Bulk import: ${plan.summary.create} created, ${plan.summary.update} updated, ${plan.summary.unchanged} unchanged`, ip, JSON.stringify({ batchId, mode: plan.mode, summary: plan.summary })])
  return { batchId, ...plan.summary, total: plan.total }
}

function bulkHandler(pool, secret) {
  return async (req, res) => {
    let db
    try {
      const { rows, mode = 'update', action = 'preview', previewToken } = req.body
      if (!['preview', 'apply'].includes(action)) return res.status(400).json({ error: 'Invalid action' })
      let claim
      if (action === 'apply') {
        try { claim = jwt.verify(previewToken, secret, { algorithms: ['HS256'], audience: 'asset-bulk-preview' }) } catch { return res.status(409).json({ error: 'Preview expired or invalid. Validate the file again.' }) }
        if (claim.sub !== String(req.user.id) || claim.input !== hash({ rows, mode })) return res.status(409).json({ error: 'File or mode changed. Validate again.' })
      }
      db = await pool.connect()
      await db.query(action === 'preview' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
      await db.query("SET LOCAL lock_timeout = '5s'")
      if (action === 'apply') {
        // Serializes commits with asset edits/transfers and freezes reference validation.
        await db.query('LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE')
        await db.query('LOCK TABLE plants, departments, asset_masters IN SHARE MODE')
      }
      const plan = await planImport(db, rows, mode)
      const digest = hash(plan)
      if (action === 'preview') {
        await db.query('COMMIT')
        const token = plan.errors.length ? null : jwt.sign({ input: hash({ rows, mode }), digest }, secret, { algorithm: 'HS256', subject: String(req.user.id), audience: 'asset-bulk-preview', expiresIn: '15m' })
        return res.json({ ...plan, previewToken: token })
      }
      if (plan.errors.length || claim.digest !== digest) {
        await db.query('ROLLBACK')
        return res.status(409).json({ error: 'Records or reference data changed. Nothing saved; validate again.', errors: plan.errors })
      }
      const result = await saveImport(db, plan, req.user, req.ip)
      await db.query('COMMIT')
      return res.json(result)
    } catch (err) {
      if (db) await db.query('ROLLBACK').catch(() => {})
      console.error('Bulk import:', err.message)
      return res.status(400).json({ error: 'Nothing saved. ' + (err.code ? 'Database rejected the import; revalidate and retry.' : err.message) })
    } finally { db?.release() }
  }
}

module.exports = { bulkHandler, planImport, saveImport, dateValue, MAX_ROWS }

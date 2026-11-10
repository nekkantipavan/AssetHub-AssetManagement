// Runs against session-local TEMP tables; never writes to application tables.
const assert = require('node:assert/strict')
const { Pool } = require('pg')
const { planImport, bulkHandler, dateValue } = require('../bulkAssets')
const fields = require('../assetFieldSpec')
const Module = require('module')
const { buildSync } = require('../../node_modules/esbuild')
require('dotenv').config()

async function main() {
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD })
  const db = await pool.connect()
  let checks = 0
  const check = (value, message) => { assert.ok(value, message); checks++; console.log('PASS:', message) }
  try {
    await db.query(`CREATE TEMP TABLE plants (id integer, code text, name text, status text);
      CREATE TEMP TABLE departments (id integer, code text, name text, status text, plant_id integer);
      CREATE TEMP TABLE asset_masters (type text, value text, is_active boolean);
      CREATE TEMP TABLE audit_logs (id serial, user_id integer, action text, module text, details text, ip_address text, created_at timestamp, meta jsonb);`)
    const columns = fields.map(f => `${f.db} ${['integer','plant','department'].includes(f.type) ? 'integer' : f.type === 'numeric' ? 'numeric(15,2)' : f.type === 'date' ? 'date' : 'text'}`)
    await db.query(`CREATE TEMP TABLE assets (id serial primary key, ${columns.join(',')}, parent_asset_id integer, assigned_user_id integer, created_at timestamp, updated_at timestamp, UNIQUE(asset_code, sub_sequence), CHECK(acquisition_value < 999999999))`)
    // Fail closed if any test table resolves outside the session's temporary schema.
    for (const name of ['assets', 'plants', 'departments', 'asset_masters', 'audit_logs']) {
      const r = await db.query('SELECT relpersistence FROM pg_class WHERE oid=$1::regclass', [name])
      assert.equal(r.rows[0].relpersistence, 't')
    }
    await db.query("INSERT INTO plants VALUES (1,'001','Plant One','Active'),(2,'002','Plant Two','Active'); INSERT INTO departments VALUES (2,'IT2','Information Technology','Active',2),(1,'IT','Information Technology','Active',1)")
    for (const field of fields.filter(f => f.master)) await db.query('INSERT INTO asset_masters VALUES ($1,$2,true)', [field.master, field.master + ' value'])
    const valid = code => Object.fromEntries(fields.map(f => [f.col,
      f.db === 'asset_code' ? code : f.db === 'sub_sequence' ? '0' : f.type === 'date' ? (f.required ? '2026-11-06' : '') : f.type === 'numeric' ? '100.50' : f.type === 'year' ? '2026' : f.type === 'plant' ? '001' : f.type === 'department' ? 'IT' : f.type === 'enum' ? 'Active' : f.master ? f.master + ' value' : f.required ? 'Test ' + f.col : ''
    ]))
    const servicePool = { connect: async () => ({ query: db.query.bind(db), release() {} }) }
    const handler = bulkHandler(servicePool, 'test-only-secret')
    async function request(body, userId = 1) {
      let code = 200, data
      const res = { status(n) { code = n; return this }, json(value) { data = value; return this } }
      await handler({ body, user: { id: userId }, ip: '127.0.0.1' }, res)
      return { code, data }
    }
    async function apply(rows, mode, preview) {
      const p = preview || (await request({ rows, mode })).data
      assert.equal(p.errors.length, 0, JSON.stringify(p.errors))
      return request({ rows, mode, action: 'apply', previewToken: p.previewToken })
    }
    const root = valid('000123'), child = { ...valid('000123'), 'Sub Asset Number': '1' }
    let p = await request({ rows: [child, root], mode: 'create' })
    check(p.data.summary.create === 2 && p.data.previewToken, 'preview validates parent/child even when child comes first')
    check((await db.query('SELECT COUNT(*)::int n FROM assets')).rows[0].n === 0, 'preview writes nothing')
    check((await apply([child, root], 'create', p.data)).code === 200, 'confirmed create succeeds')
    let assets = (await db.query('SELECT *, xmin::text record_version FROM assets ORDER BY sub_sequence')).rows
    const originalId = assets[0].id
    check(assets[1].parent_asset_id === originalId && assets[0].asset_code === '000123', 'leading zeros and parent relationships preserved')

    const filename = require.resolve('../../src/data/assetWorkbook.js')
    const output = buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
    const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths; compiled._compile(output, filename)
    const { buildAssetExport, exportHeaders } = compiled.exports
    const exported = buildAssetExport({ ...assets[0], plant_code: '001', plant_name: 'Plant One', dept_name: 'Information Technology' })
    check(fields.every((f, i) => exportHeaders[i] === f.col) && exported['Asset Code'] === '000123' && exported['Reference / Invoice No'], 'report contains every import column first plus extras')
    // Exercise actual Excel serialization, including optional blank dates and identifiers.
    const XLSX = require('../../node_modules/xlsx')
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([exported]), 'Assets')
    const roundTrip = XLSX.utils.sheet_to_json(XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }).Sheets.Assets, { raw: false, defval: '' })
    p = await request({ rows: roundTrip, mode: 'update' })
    check(p.data.errors.length === 0 && p.data.summary.unchanged === 1, 'unchanged exported workbook reimports as unchanged')
    const update = { ...roundTrip[0], 'Asset Description': 'Updated description', 'Note': 'New note' }
    check((await apply([update], 'update')).code === 200, 'exported workbook updates existing asset')
    let record = (await db.query('SELECT * FROM assets WHERE id=$1', [originalId])).rows[0]
    check(record.name === 'Updated description' && (await db.query('SELECT COUNT(*)::int n FROM assets')).rows[0].n === 2, 'updates preserve asset ID and do not duplicate records')
    p = await request({ rows: [update], mode: 'update' })
    check(!p.data.errors.length && p.data.summary.unchanged === 1, 're-upload of applied file is unchanged even with an older version')
    p = await request({ rows: [{ ...roundTrip[0], 'Asset Description': 'Stale edit' }], mode: 'update' })
    check(p.data.errors.some(e => e.field === 'Record Version'), 'stale exports cannot overwrite newer changes')
    p = await request({ rows: [{ ...roundTrip[0], 'Asset Code': 'TYPO' }], mode: 'upsert' })
    check(p.data.errors.some(e => e.field === 'Asset Record ID'), 'exported identity edits cannot create a duplicate asset')

    const patch = { 'Asset Code': '000123', 'Sub Asset Number': 0, 'Note': '' }
    p = await request({ rows: [patch], mode: 'update' })
    check(!p.data.errors.length && p.data.summary.unchanged === 1, 'numeric zero identity, blank cells and missing columns preserve values')
    check((await apply([{ ...patch, Note: '[CLEAR]' }], 'update')).code === 200 && (await db.query('SELECT notes FROM assets WHERE id=$1', [originalId])).rows[0].notes === null, 'explicit clear empties optional fields')
    check((await request({ rows: [{ ...patch, 'Asset Description': '[CLEAR]' }], mode: 'update' })).data.errors.length > 0, 'required fields cannot be cleared')
    check((await request({ rows: [patch, patch], mode: 'update' })).data.errors.length > 0, 'duplicate file identities rejected')
    check((await request({ rows: [{ ...patch, 'Sub Asset Number': '1.5' }], mode: 'update' })).data.errors.length > 0, 'fractional sub numbers rejected')
    check((await request({ rows: [{ ...patch, 'Capitalized On': '31/02/2026' }], mode: 'update' })).data.errors.length > 0, 'impossible calendar dates rejected')
    check((await request({ rows: [valid('NEW')], mode: 'update' })).data.errors.length > 0, 'update mode never creates records')
    check((await request({ rows: [root], mode: 'create' })).data.errors.length > 0, 'create mode never overwrites existing records')
    check((await request({ rows: [{ ...patch, 'Business Area Code': '002' }], mode: 'update' })).data.errors.length > 0, 'custody changes require transfer workflow')
    await db.query("UPDATE assets SET status='Pending Transfer' WHERE id=$1", [originalId])
    check((await request({ rows: [{ ...patch, Note: 'Forbidden' }], mode: 'update' })).data.errors.length > 0, 'assets in active workflow cannot be bulk edited')
    await db.query("UPDATE assets SET status='Active' WHERE id=$1", [originalId])
    const change = { ...patch, Note: 'Proposed' }
    p = await request({ rows: [change], mode: 'update' })
    await db.query("UPDATE assets SET notes='Concurrent edit' WHERE id=$1", [originalId])
    check((await apply([change], 'update', p.data)).code === 409, 'changes after preview reject confirmation')
    check((await request({ rows: [change], mode: 'update', action: 'apply' })).code === 409, 'apply requires valid preview')
    p = await request({ rows: [change], mode: 'update' })
    check((await request({ rows: [change], mode: 'update', action: 'apply', previewToken: p.data.previewToken }, 2)).code === 409, 'preview belongs to the confirming user')
    check((await request({ rows: [{ ...change, Note: 'Swapped' }], mode: 'update', action: 'apply', previewToken: p.data.previewToken })).code === 409, 'preview is bound to exact file and mode')
    const mixed = [change, valid('NEW')]
    check((await apply(mixed, 'upsert')).code === 200, 'mixed batch can create and update')
    const beforeCount = (await db.query('SELECT COUNT(*)::int n FROM assets')).rows[0].n
    const failing = [{ ...change, Note: 'Must roll back' }, { ...valid('FAIL'), 'Acquisition Value': '999999999' }]
    check((await apply(failing, 'upsert')).code === 400, 'database write error rejects batch')
    check((await db.query('SELECT COUNT(*)::int n FROM assets')).rows[0].n === beforeCount && (await db.query('SELECT notes FROM assets WHERE id=$1', [originalId])).rows[0].notes === 'Proposed', 'failed batch rolls back updates and inserts together')
    const logs = (await db.query("SELECT meta FROM audit_logs WHERE action='Asset Modified'")).rows
    check(logs.length > 0 && logs.every(l => l.meta.batchId && l.meta.old && l.meta.new), 'transactional audit includes batch and before/after values')
    assert.equal(dateValue('06/11/2026'), '2026-11-06')
    console.log(`All ${checks} integration checks passed. Temporary tables removed when connection closes.`)
  } finally { db.release(); await pool.end() }
}
main().catch(err => { console.error(err); process.exitCode = 1 })

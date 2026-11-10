// Run from server: node scripts/benchmark_100k.cjs [--serve]
// Creates a disposable schema-only database and uses the actual API for all asset writes.
const { Pool } = require('pg')
const { spawn, spawnSync } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const bcrypt = require('bcrypt')
const XLSX = require('../../node_modules/xlsx')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const server = path.join(__dirname, '..')
const root = path.join(server, '..')
const host = process.env.DB_HOST || 'localhost'
const reuse = process.argv.find(arg => arg.startsWith('--compare='))?.slice('--compare='.length)
const database = reuse || `asset_bench_${randomBytes(6).toString('hex')}`
const apiPort = reuse ? 3302 : 3301
const uiPort = reuse ? 5175 : 5174
const origin = `http://127.0.0.1:${apiPort}`
const size = 5000
const total = 100000
const password = 'Benchmark-only-2026!'
const config = { host, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD }
const source = new Pool({ ...config, database: process.env.DB_NAME, connectionTimeoutMillis: 5000 })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const code = n => `BENCH-${String(n).padStart(6, '0')}`
let token

async function request(url, { body, method, auth = token, expected = 200 } = {}) {
  const start = performance.now()
  const headers = auth ? { Authorization: `Bearer ${auth}` } : {}
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body) }
  const response = await fetch(origin + url, { headers, method, body, signal: AbortSignal.timeout(120000) })
  const buffer = Buffer.from(await response.arrayBuffer())
  const json = response.headers.get('content-type')?.includes('json') ? JSON.parse(buffer.toString()) : null
  if (response.status !== expected) throw new Error(`${method || 'GET'} ${url} returned ${response.status}: ${json?.error || buffer.toString().slice(0, 150)}`)
  return { json, bytes: buffer.length, ms: performance.now() - start, mime: response.headers.get('content-type') }
}

function asset(n) {
  const sub = n % 10 === 2 ? 1 : 0
  const plant = (n - sub - 1) % 8 + 1
  const kind = ['Router', 'Laptop', 'Motor', 'Printer'][n % 4]
  return {
    'Asset Code': code(n - sub), 'Sub Asset Number': sub, 'Capitalized On': '2025-04-01',
    'Asset Description': `${kind} model ${n % 700}`, 'Acquisition Value': 5000 + n % 90000,
    'Company Code': 'BC01', 'Business Area Code': `P${plant}`, 'Asset Class': kind,
    'Cost Center': 'BC100', 'Serial Number': `BSN-${n}`, 'Reference / Invoice No': `INV-${n}`,
    'Supplier Name': 'Benchmark Supply', 'Manufacturer of Asset': 'Benchmark Works',
    'Fiscal Year': '2025', 'Category': kind, 'Department': `D${n % 3 + 1}`,
    'Assigned Employee': `Custodian ${n % 400}`, 'Status': n % 9 ? 'Active' : 'Inactive',
    'Asset Status': 'In Use', 'Warranty Date': '2028-04-01', 'Note': 'Synthetic benchmark asset',
  }
}

async function preview(rows, mode) { return request('/api/assets/bulk', { method: 'POST', body: { rows, mode, action: 'preview' } }) }
async function apply(rows, mode, previewToken) { return request('/api/assets/bulk', { method: 'POST', body: { rows, mode, action: 'apply', previewToken } }) }

function stats(samples) {
  const sorted = samples.map(s => s.ms).sort((a, b) => a - b)
  return { samples: sorted.length, p50: Math.round(sorted[Math.ceil(sorted.length * .5) - 1]), p95: Math.round(sorted[Math.ceil(sorted.length * .95) - 1]), maxBytes: Math.max(...samples.map(s => s.bytes)) }
}

async function profile(routes, concurrency) {
  const result = {}
  for (const [key, url] of Object.entries(routes)) {
    const samples = []
    await Promise.all(Array.from({ length: concurrency }, async () => {
      for (let i = 0; i < Math.ceil(30 / concurrency); i++) samples.push(await request(url))
    }))
    result[key] = stats(samples)
  }
  return result
}

async function seed(db) {
  await db.query(await fs.readFile(path.join(server, 'migrations', '012_asset_photos.sql'), 'utf8'))
  for (let i = 1; i <= 8; i++) {
    const { rows: [plant] } = await db.query("INSERT INTO plants(code,name,location,head,status,challan_prefix) VALUES($1,$2,'Test campus','Test lead','Active',$3) RETURNING id", [`P${i}`, `Benchmark plant ${i}`, `BP${i}`])
    for (let d = 1; d <= 3; d++) await db.query("INSERT INTO departments(code,name,plant_id,manager,status) VALUES($1,$2,$3,'Test manager','Active')", [`D${d}`, `Department ${d}`, plant.id])
  }
  const masters = { company_code: ['BC01'], cost_center: ['BC100'], asset_status: ['In Use'], category: ['Router','Laptop','Motor','Printer'], asset_class: ['Router','Laptop','Motor','Printer'] }
  for (const [type, values] of Object.entries(masters)) {
    for (const value of values) await db.query('INSERT INTO asset_masters(type,value,is_active) VALUES($1,$2,true)', [type, value])
  }
  const passwordHash = await bcrypt.hash(password, 10)
  for (const [username, role] of [['benchmark', 'Admin'], ['benchmark-view', 'User']]) {
    await db.query("INSERT INTO users(employee_id,username,name,email,password_hash,role,status) VALUES($1,$1,$1,$2,$3,$4,'Active')", [username, `${username}@example.invalid`, passwordHash, role])
  }
}

async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !process.env.DB_NAME) throw Error('The benchmark requires a configured local PostgreSQL database.')
  if (!/^asset_bench_[0-9a-f]{12}$/.test(database) || database === process.env.DB_NAME) throw Error('Invalid isolated benchmark database.')
  if (process.argv.includes('--inspect')) {
    try {
      const status = await source.query("SELECT datname, state, wait_event, round(extract(epoch FROM now()-query_start)) AS seconds, left(query, 100) AS query FROM pg_stat_activity WHERE datname LIKE 'asset_bench_%' ORDER BY query_start DESC LIMIT 12")
      console.table(status.rows)
    } finally { await source.end() }
    return
  }
  const work = path.join(root, '.asset-benchmark', database)
  await fs.mkdir(work, { recursive: true })
  const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin'
  const env = { ...process.env, PGPASSWORD: config.password, PGHOST: host, PGPORT: String(config.port), PGUSER: config.user }
  const pg = (exe, args, input) => {
    const r = spawnSync(path.join(bin, `${exe}.exe`), args, { env, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true })
    if (r.error || r.status !== 0) throw Error(`${exe}: ${r.error?.message || r.stderr}`)
    return r.stdout
  }
  let created = false, db, api, vite
  try {
    if (!reuse) {
      const schema = pg('pg_dump', ['-w', '--schema-only', '--no-owner', '--no-privileges', process.env.DB_NAME])
      await source.query(`CREATE DATABASE ${database}`)
      created = true
      pg('psql', ['-w', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database], schema)
    }
    db = new Pool({ ...config, database })
    if (reuse) {
      const { rows: [counts] } = await db.query("SELECT count(*)::int total, count(*) FILTER (WHERE asset_code LIKE 'BENCH-%')::int synthetic FROM assets")
      assert.deepEqual(counts, { total, synthetic: total })
      await db.query(await fs.readFile(path.join(server, 'migrations', '013_asset_read_indexes.sql'), 'utf8'))
      await db.query('VACUUM (ANALYZE) assets')
      await db.query('VACUUM (ANALYZE) audit_logs')
      console.log('Read indexes installed in the isolated database.')
    } else await seed(db)
    const log = await fs.open(path.join(work, reuse ? 'optimized-api.log' : 'api.log'), 'w')
    const secret = randomBytes(32).toString('hex')
    api = spawn(process.execPath, ['index.js'], {
      cwd: server, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, DB_NAME: database, JWT_SECRET: secret, PORT: String(apiPort), API_BIND_HOST: '127.0.0.1', ASSET_PHOTO_DIR: path.join(work, 'photos') },
    })
    await log.close()
    const login = username => request('/api/auth/login', { auth: '', method: 'POST', body: { username, password } })
    for (let i = 0; i < 40; i++) {
      if (api.exitCode != null) throw Error(`Test API exited. See ${work}/api.log`)
      try { token = (await login('benchmark')).json.token; break }
      catch (error) { if (i === 39) throw error; await pause(350) }
    }
    require('jsonwebtoken').verify(token, secret)
    if (reuse) {
      const output = path.join(root, 'docs', 'benchmark-100k-results.json')
      const baseline = JSON.parse(await fs.readFile(output, 'utf8'))
      assert.equal(baseline.database, database)
      const routes = {
        list: '/api/assets?pageSize=25', report: '/api/reports/assets?pageSize=50', lastPage: '/api/assets?page=4000&pageSize=25',
        code: `/api/assets?search=${code(60001)}`, serial: '/api/assets?search=BSN-60002', name: '/api/assets?search=Router',
        custodian: '/api/assets?search=Custodian%2025', combined: '/api/assets?plant_id=1&status=Active&category=Router',
        combinedWithMatches: '/api/assets?plant_id=1&status=Active&category=Laptop',
        noResults: '/api/assets?search=absent-bench-asset', detail: `/api/assets/${baseline.photos.assetId}`,
      }
      baseline.optimized = { preparation: 'Migration 013 plus VACUUM (ANALYZE) on assets and audit logs', profiles: {} }
      for (const n of [1, 5, 10]) {
        baseline.optimized.profiles[n] = await profile(routes, n)
        console.log(`Optimized profile at concurrency ${n}: ${JSON.stringify(baseline.optimized.profiles[n])}`)
      }
      await fs.writeFile(output, JSON.stringify(baseline, null, 2) + '\n')
      if (process.argv.includes('--serve')) {
        vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, ASSET_API_PROXY: origin } })
        console.log(`Optimized isolated UI: http://127.0.0.1:${uiPort}/assets/${baseline.photos.assetId}. Press Enter to stop.`)
        await waitForCleanup()
      }
      return
    }
    const result = { database, total, apiPort, imports: [], validation: {}, profiles: {} }
    let duringImport
    for (let offset = 0; offset < total; offset += size) {
      const batch = offset / size + 1
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(Array.from({ length: size }, (_, i) => asset(offset + i + 1))))
      const file = path.join(work, `batch-${String(batch).padStart(2, '0')}.csv`)
      await fs.writeFile(file, csv)
      const rows = XLSX.utils.sheet_to_json(XLSX.readFile(file, { raw: true }).Sheets.Sheet1, { defval: '' })
      const check = await preview(rows, 'create')
      assert.equal(check.json.summary.errors, 0, JSON.stringify(check.json.errors.slice(0, 3)))
      assert.ok(check.json.previewToken)
      const saving = apply(rows, 'create', check.json.previewToken)
      if (batch === total / size) duringImport = profile({ list: '/api/assets?pageSize=25', filter: '/api/assets?status=Inactive&pageSize=25' }, 5)
      const saved = await saving
      assert.equal(saved.json.create, size)
      result.imports.push({ batch, rows: size, previewMs: Math.round(check.ms), applyMs: Math.round(saved.ms), previewBytes: check.bytes })
      console.log(`Batch ${batch}/20: ${saved.json.create} created, preview ${Math.round(check.ms)} ms, save ${Math.round(saved.ms)} ms`)
    }
    result.profiles.duringImport = await duringImport
    assert.equal((await db.query('SELECT count(*)::int count FROM assets')).rows[0].count, total)
    assert.equal((await db.query('SELECT count(*)::int count FROM assets WHERE sub_sequence > 0 AND parent_asset_id IS NOT NULL')).rows[0].count, 10000)
    await db.query('ANALYZE assets')
    const identical = [asset(1), asset(2)]
    const unchanged = await preview(identical, 'update')
    assert.equal(unchanged.json.summary.unchanged, 2)
    assert.ok((await preview([asset(1), asset(1)], 'update')).json.summary.errors)
    assert.ok((await preview([{ ...asset(1), 'Capitalized On': '2025-02-30' }], 'update')).json.summary.errors)
    const changes = Array.from({ length: size }, (_, i) => ({ 'Asset Code': asset(i + 1)['Asset Code'], 'Sub Asset Number': asset(i + 1)['Sub Asset Number'], Note: 'Updated benchmark note' }))
    const update = await preview(changes, 'update')
    const saved = await apply(changes, 'update', update.json.previewToken)
    assert.equal(saved.json.update, size)
    result.validation = { unchanged: 2, duplicateRejected: true, invalidDateRejected: true, updated: size, updatePreviewMs: Math.round(update.ms), updateApplyMs: Math.round(saved.ms), linkedSubAssets: 10000 }
    const assetId = (await db.query('SELECT id FROM assets WHERE asset_code=$1 AND sub_sequence=0', [code(1)])).rows[0].id
    const routes = {
      list: '/api/assets?pageSize=25', report: '/api/reports/assets?pageSize=50', lastPage: '/api/assets?page=4000&pageSize=25',
      code: `/api/assets?search=${code(60001)}`, serial: '/api/assets?search=BSN-60002', name: '/api/assets?search=Router',
      custodian: '/api/assets?search=Custodian%2025', combined: '/api/assets?plant_id=1&status=Active&category=Router',
      noResults: '/api/assets?search=absent-bench-asset', detail: `/api/assets/${assetId}`,
    }
    for (const n of [1, 5, 10]) {
      result.profiles[n] = await profile(routes, n)
      console.log(`Read profile at concurrency ${n}: ${JSON.stringify(result.profiles[n])}`)
    }
    const before = await request(routes.detail)
    const image = await require('sharp')({ create: { width: 1800, height: 1200, channels: 3, background: '#ff9900' } }).jpeg().toBuffer()
    const photoIds = []
    const uploadPhoto = async (buffer, name, expected, auth) => {
      const body = new FormData(); body.append('photo', new Blob([buffer]), name)
      return request(`/api/assets/${assetId}/photos`, { body, method: 'POST', expected, auth })
    }
    for (let i = 0; i < 3; i++) photoIds.push((await uploadPhoto(image, `benchmark-photo-${i + 1}.jpg`, 201)).json.id)
    const metadata = await request(`/api/assets/${assetId}/photos`)
    assert.equal(metadata.json.length, 3)
    const thumbnail = await request(`/api/assets/${assetId}/photos/${photoIds[0]}/thumb`)
    const full = await request(`/api/assets/${assetId}/photos/${photoIds[0]}/full`)
    assert.equal(thumbnail.mime, 'image/webp')
    assert.ok(thumbnail.bytes < full.bytes && thumbnail.bytes < 100000)
    await request(`/api/assets/${assetId}/photos/${photoIds[0]}/thumb`, { auth: '', expected: 401 })
    await request(`/api/assets/${assetId + 1}/photos/${photoIds[0]}/thumb`, { expected: 404 })
    await uploadPhoto(Buffer.from('Not an image'), 'fake.jpg', 422)
    const viewer = (await login('benchmark-view')).json.token
    await uploadPhoto(image, 'forbidden.jpg', 403, viewer)
    const after = await request(routes.detail)
    assert.deepEqual(after.json, before.json)
    result.photos = { assetId, count: 3, thumbnailBytes: thumbnail.bytes, fullBytes: full.bytes, detailBytesBefore: before.bytes, detailBytesAfter: after.bytes, detailWithPhotos: (await profile({ detail: routes.detail }, 1)).detail, metadataBytes: metadata.bytes, invalidRejected: true, unauthenticatedRejected: true, crossAssetRejected: true, readOnlyUploadRejected: true }
    const output = path.join(root, 'docs', 'benchmark-100k-results.json')
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n')
    console.log(`Results saved to ${output}; ${total} assets confirmed.`)
    if (process.argv.includes('--serve')) {
      vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, ASSET_API_PROXY: origin } })
      console.log(`Isolated UI: http://127.0.0.1:${uiPort}/assets/${assetId}. Press Enter to clean up.`)
      await waitForCleanup()
    }
  } finally {
    vite?.kill()
    api?.kill()
    await db?.end()
    if (created) await source.query(`DROP DATABASE ${database} WITH (FORCE)`)
    await source.end()
  }
}
async function waitForCleanup() {
  await new Promise(resolve => { process.stdin.resume(); process.stdin.once('data', resolve); const timeout = setTimeout(resolve, 900000); timeout.unref() })
  process.stdin.pause()
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })

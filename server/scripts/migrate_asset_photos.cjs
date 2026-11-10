const fs = require('node:fs/promises')
const path = require('node:path')
const pool = require('../db')

async function migrate() {
  try {
    for (const name of ['012_asset_photos.sql', '013_asset_read_indexes.sql']) {
      const sql = await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8')
      await pool.query(sql)
      console.log(`Applied ${name}`)
    }
  } finally { await pool.end() }
}

migrate().catch(error => { console.error(error.message); process.exitCode = 1 })

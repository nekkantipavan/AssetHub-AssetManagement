const { Pool } = require('pg')

const configs = [
  { name: 'localhost TCP', host: 'localhost', port: 5432 },
  { name: '127.0.0.1 TCP', host: '127.0.0.1', port: 5432 },
  { name: 'Unix socket', host: '/var/run/postgresql', port: 5432 },
]

async function testConnection(config) {
  console.log(`\nTesting: ${config.name}`)
  const pool = new Pool({
    ...config,
    database: 'assethub',
    user: 'postgres',
    password: 'root',
    connectionTimeoutMillis: 3000,
  })

  return new Promise((resolve) => {
    pool.connect((err, client, release) => {
      if (err) {
        console.log(`  ✗ Failed: ${err.message}`)
        resolve(false)
      } else {
        console.log(`  ✓ Connected!`)
        release()
        pool.end()
        resolve(true)
      }
    })
  })
}

async function main() {
  console.log('Testing PostgreSQL connections...')
  for (const config of configs) {
    await testConnection(config)
  }
}

main()

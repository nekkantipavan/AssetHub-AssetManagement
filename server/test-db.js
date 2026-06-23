const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'assethub',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  connectionTimeoutMillis: 5000,
})

console.log('Attempting to connect to database...')
console.log('Config:', {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'assethub',
  user: process.env.DB_USER || 'postgres',
})

pool.connect((err, client, release) => {
  if (err) {
    console.error('Connection error:', err.message)
    console.error('Error code:', err.code)
    process.exit(1)
  } else {
    console.log('✓ Connected to PostgreSQL!')
    client.query('SELECT NOW()', (err, result) => {
      release()
      if (err) {
        console.error('Query error:', err.message)
      } else {
        console.log('✓ Query successful! Current time:', result.rows[0])
      }
      pool.end()
    })
  }
})

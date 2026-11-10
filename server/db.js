const { Pool } = require('pg')
require('dotenv').config()

console.log('Database Config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
})

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  statement_timeout: 30000,
  query_timeout:     30000,
})

pool.on('error', (err) => {
  console.error('Pool error:', err.message, err.code)
})

pool.on('connect', () => {
  console.log('Database connected successfully!')
})

// Test connection on startup
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Database test query failed:', err.message)
  } else {
    console.log('✓ Database connection verified!')
  }
})

module.exports = pool

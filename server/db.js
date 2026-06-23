const { Pool } = require('pg')
require('dotenv').config()

console.log('Database Config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
})

// Try connection string approach
const connectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`

const pool = new Pool({
  connectionString: connectionString,
  statement_timeout: 30000,
  query_timeout: 30000,
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

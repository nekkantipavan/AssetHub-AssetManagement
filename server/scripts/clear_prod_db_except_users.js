/**
 * AssetHub - Production Database Cleaner (Preserving Users)
 * 
 * Usage on Production Server:
 *   node scripts/clear_prod_db_except_users.js --confirm-production-wipe
 * 
 * This script connects to the PostgreSQL database configured in server/.env,
 * lists all tables, and truncates every table EXCEPT 'users' with RESTART IDENTITY CASCADE.
 */

const { Pool } = require('pg');
const readline = require('readline');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const isConfirmed = process.argv.includes('--confirm-production-wipe');

  console.log('====================================================');
  console.log('   AssetHub - Production Database Cleaner (Except Users)');
  console.log('====================================================');
  console.log(`Target Database: ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log('⚠️  WARNING: THIS WILL PERMANENTLY ERASE ALL DATA EXCEPT THE USERS TABLE!');

  if (!isConfirmed) {
    console.error('\n❌ SAFETY ERROR: Missing confirmation flag.');
    console.error('To run this script on production, you MUST explicitly provide the flag:');
    console.error('   node scripts/clear_prod_db_except_users.js --confirm-production-wipe\n');
    process.exit(1);
  }

  try {
    // 1. Fetch all user-created tables in public schema except 'users'
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('users', 'spatial_ref_sys')
      ORDER BY table_name;
    `);

    const tablesToWipe = tablesRes.rows.map(r => r.table_name);

    if (tablesToWipe.length === 0) {
      console.log('No non-user tables found to wipe.');
      process.exit(0);
    }

    console.log('\nTables to be TRUNCATED (wiped cleanly):');
    tablesToWipe.forEach(t => console.log(` - ${t}`));
    console.log('\nPreserved Table:');
    console.log(' - users (ALL user accounts, credentials, and roles remain intact)\n');

    // 2. Perform Wipe in a Transaction with FK checks disabled
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET session_replication_role = 'replica'");
      
      for (const table of tablesToWipe) {
        await client.query(`DELETE FROM "${table}"`);
      }

      // Reset auto-increment sequences for all wiped tables
      const seqRes = await client.query(`
        SELECT s.relname AS seq_name
        FROM pg_class s
        JOIN pg_depend d ON d.objid = s.oid
        JOIN pg_class t ON t.oid = d.refobjid
        WHERE s.relkind = 'S'
          AND t.relname NOT IN ('users', 'spatial_ref_sys')
      `);

      for (const row of seqRes.rows) {
        await client.query(`ALTER SEQUENCE "${row.seq_name}" RESTART WITH 1`);
      }

      await client.query("SET session_replication_role = 'origin'");
      await client.query('COMMIT');
      console.log('✅ SUCCESS: All tables except "users" have been cleared and ID sequences reset to 1.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ ERROR: Database wipe failed. Transaction rolled back cleanly.', err.message);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  } finally {
    await pool.end();
  }
}

main();

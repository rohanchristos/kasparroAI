/**
 * Kasparro AI Backend — PostgreSQL Connection Pool
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Connection lifecycle logging
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('📦  New PostgreSQL client connected');
  }
});

pool.on('error', (err) => {
  console.error('💥  Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Convenience wrapper — runs a parameterised query.
 *
 * @param {string} text  SQL statement with $1, $2, … placeholders
 * @param {any[]}  params  Values to bind
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };

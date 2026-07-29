'use strict';

const { Pool } = require('pg');
const config = require('./env');

/**
 * PostgreSQL connection pool.
 *
 * search_path is pinned to this service's own schema so every query can write
 * bare table names, and so a stray query physically cannot reach another
 * service's tables.
 */
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  options: '-c search_path=product_service,public',
});

pool.on('error', (err) => {
  console.error('[product-service] Unexpected idle client error:', err.message);
});

/** Run a parameterised query. Always prefer this over string concatenation. */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (config.env === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.warn(`[product-service] slow query (${ms}ms): ${text.slice(0, 80)}`);
  }
  return result;
}

/**
 * Run several statements inside one transaction.
 * The callback receives a dedicated client; the pool client is always released.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Verify connectivity at boot so the process dies loudly, not on first request. */
async function assertConnection() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

module.exports = { pool, query, withTransaction, assertConnection };

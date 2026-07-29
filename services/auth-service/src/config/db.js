'use strict';

const { Pool } = require('pg');
const config = require('./env');

/**
 * PostgreSQL connection pool.
 *
 * search_path is pinned to this service's own schema so every query in the
 * service can write `users` instead of `auth_service.users`, and so a stray
 * query physically cannot reach another service's tables.
 */
const pool = new Pool({
  connectionString: config.databaseUrl,
  // RDS terminates TLS with an AWS-managed CA. For local Postgres, leave off.
  ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  options: '-c search_path=auth_service,public',
});

pool.on('error', (err) => {
  // Fires for idle clients dropped by the server (RDS failover, etc.).
  console.error('[auth-service] Unexpected idle client error:', err.message);
});

/** Run a parameterised query. Always prefer this over string concatenation. */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (config.env === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.warn(`[auth-service] slow query (${ms}ms): ${text.slice(0, 80)}`);
  }
  return result;
}

/** Verify connectivity at boot so the process dies loudly, not on first request. */
async function assertConnection() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

module.exports = { pool, query, assertConnection };

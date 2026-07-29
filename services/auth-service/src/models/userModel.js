'use strict';

const { query } = require('../config/db');

/**
 * Data access for auth_service.users.
 *
 * Every query here is parameterised ($1, $2, ...). The pg driver sends
 * parameters separately from the SQL text, so user input is never parsed as
 * SQL. This is the pattern the rest of the codebase follows — the deliberate
 * exceptions live in product-service and order-service and are labelled.
 */

// Columns safe to return to a client. password_hash is never in this list.
const PUBLIC_COLUMNS = `
  id, email, full_name, role, is_active, created_at, updated_at
`;

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, password_hash, full_name, role, is_active, created_at
       FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function emailExists(email) {
  const { rows } = await query(
    'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  return rows.length > 0;
}

async function create({ email, passwordHash, fullName, role = 'customer' }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email.toLowerCase(), passwordHash, fullName, role]
  );
  return rows[0];
}

async function updateProfile(id, { fullName }) {
  const { rows } = await query(
    `UPDATE users
        SET full_name = COALESCE($2, full_name)
      WHERE id = $1
      RETURNING ${PUBLIC_COLUMNS}`,
    [id, fullName ?? null]
  );
  return rows[0] || null;
}

async function updatePassword(id, passwordHash) {
  const { rowCount } = await query(
    'UPDATE users SET password_hash = $2 WHERE id = $1',
    [id, passwordHash]
  );
  return rowCount > 0;
}

/** Used by the other services to confirm a user id actually exists. */
async function existsById(id) {
  const { rows } = await query('SELECT 1 FROM users WHERE id = $1 AND is_active LIMIT 1', [id]);
  return rows.length > 0;
}

async function listAll({ limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}
       FROM users
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

module.exports = {
  findByEmail,
  findById,
  emailExists,
  create,
  updateProfile,
  updatePassword,
  existsById,
  listAll,
};

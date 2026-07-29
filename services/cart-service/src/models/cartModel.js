'use strict';

const { query } = require('../config/db');

/**
 * Data access for cart_service.cart_items.
 * All queries parameterised.
 */

async function findByUser(userId) {
  const { rows } = await query(
    `SELECT id, user_id, product_id, quantity, created_at, updated_at
       FROM cart_items
      WHERE user_id = $1
      ORDER BY created_at ASC`,
    [userId]
  );
  return rows;
}

async function findItem(userId, productId) {
  const { rows } = await query(
    `SELECT id, user_id, product_id, quantity
       FROM cart_items
      WHERE user_id = $1 AND product_id = $2
      LIMIT 1`,
    [userId, productId]
  );
  return rows[0] || null;
}

/**
 * Add to cart, or bump quantity if the product is already there.
 *
 * The upsert relies on the cart_items_user_product_uniq index from schema.sql.
 * Doing it in one statement (rather than SELECT-then-INSERT) removes the race
 * where two rapid "add to cart" clicks both see an empty cart and one fails.
 */
async function upsertItem(userId, productId, quantity) {
  const { rows } = await query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity,
                   updated_at = NOW()
     RETURNING id, user_id, product_id, quantity, created_at, updated_at`,
    [userId, productId, quantity]
  );
  return rows[0];
}

/** Set an absolute quantity (as opposed to adding to it). */
async function setQuantity(userId, productId, quantity) {
  const { rows } = await query(
    `UPDATE cart_items
        SET quantity = $3
      WHERE user_id = $1 AND product_id = $2
      RETURNING id, user_id, product_id, quantity, created_at, updated_at`,
    [userId, productId, quantity]
  );
  return rows[0] || null;
}

async function removeItem(userId, productId) {
  const { rowCount } = await query(
    'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
    [userId, productId]
  );
  return rowCount > 0;
}

async function clearCart(userId) {
  const { rowCount } = await query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
  return rowCount;
}

async function countItems(userId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(quantity), 0)::int AS units,
            COUNT(*)::int                   AS lines
       FROM cart_items WHERE user_id = $1`,
    [userId]
  );
  return rows[0];
}

module.exports = {
  findByUser,
  findItem,
  upsertItem,
  setQuantity,
  removeItem,
  clearCart,
  countItems,
};

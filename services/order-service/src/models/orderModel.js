'use strict';

const { query, withTransaction } = require('../config/db');

/**
 * Data access for order_service.orders / .order_items.
 *
 * All queries parameterised EXCEPT findByStatusRawUnsafe() at the bottom,
 * which is an intentional WAF test target.
 */

const ORDER_COLUMNS = `
  id, order_number, user_id, status,
  subtotal, shipping_cost, tax, total_amount, currency,
  ship_full_name, ship_email, ship_phone,
  ship_address1, ship_address2, ship_city, ship_state, ship_postal_code, ship_country,
  payment_method, notes, placed_at, created_at, updated_at
`;

/** Human-friendly order number, e.g. SW-20260728-4F9C2A. */
function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SW-${date}-${suffix}`;
}

/**
 * Insert an order and all its line items in ONE transaction.
 *
 * If any line item fails, the order header is rolled back too — there is no
 * state where an order exists with a partial set of items.
 */
async function createOrder({ userId, totals, shipping, paymentMethod, notes, items }) {
  return withTransaction(async (client) => {
    const orderNumber = generateOrderNumber();

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
         order_number, user_id, status,
         subtotal, shipping_cost, tax, total_amount,
         ship_full_name, ship_email, ship_phone,
         ship_address1, ship_address2, ship_city, ship_state, ship_postal_code, ship_country,
         payment_method, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING ${ORDER_COLUMNS}`,
      [
        orderNumber,
        userId,
        'pending',
        totals.subtotal,
        totals.shipping,
        totals.tax,
        totals.total,
        shipping.fullName,
        shipping.email,
        shipping.phone ?? null,
        shipping.address1,
        shipping.address2 ?? null,
        shipping.city,
        shipping.state ?? null,
        shipping.postalCode,
        shipping.country,
        paymentMethod,
        notes ?? null,
      ]
    );

    const order = orderRows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_image, unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.id,
          item.productId,
          item.name,
          item.imageUrl ?? null,
          item.unitPrice,
          item.quantity,
          item.lineTotal,
        ]
      );
    }

    return order;
  });
}

async function findItemsByOrderIds(orderIds) {
  if (!orderIds.length) return [];
  const { rows } = await query(
    `SELECT id, order_id, product_id, product_name, product_image,
            unit_price, quantity, line_total
       FROM order_items
      WHERE order_id = ANY($1::uuid[])`,
    [orderIds]
  );
  return rows;
}

async function findByUser(userId, { status, limit = 20, offset = 0 } = {}) {
  const params = [userId];
  let statusFilter = '';
  if (status) {
    params.push(status);
    statusFilter = `AND status = $${params.length}`;
  }
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT ${ORDER_COLUMNS} FROM orders
      WHERE user_id = $1 ${statusFilter}
      ORDER BY placed_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = status ? [userId, status] : [userId];
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM orders WHERE user_id = $1 ${statusFilter}`,
    countParams
  );

  return { orders: rows, total: countRows[0].total };
}

async function findById(id) {
  const { rows } = await query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByOrderNumber(orderNumber) {
  const { rows } = await query(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE order_number = $1 LIMIT 1`,
    [orderNumber]
  );
  return rows[0] || null;
}

async function findAll({ status, userId, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    where.push(`user_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${ORDER_COLUMNS} FROM orders ${whereSql}
      ORDER BY placed_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM orders ${whereSql}`,
    params.slice(0, params.length - 2)
  );

  return { orders: rows, total: countRows[0].total };
}

async function updateStatus(id, status) {
  const { rows } = await query(
    `UPDATE orders SET status = $2 WHERE id = $1 RETURNING ${ORDER_COLUMNS}`,
    [id, status]
  );
  return rows[0] || null;
}

/** Aggregate figures for the admin dashboard. */
async function stats() {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int                                              AS total_orders,
       COALESCE(SUM(total_amount), 0)::float                       AS revenue,
       COUNT(*) FILTER (WHERE status = 'pending')::int             AS pending,
       COUNT(*) FILTER (WHERE status = 'shipped')::int             AS shipped,
       COUNT(*) FILTER (WHERE status = 'delivered')::int           AS delivered,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int           AS cancelled
     FROM orders`
  );
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️  DELIBERATELY VULNERABLE — DO NOT COPY, DO NOT SHIP TO PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * VULNERABLE ON PURPOSE - for WAF testing
 *
 * Admin order report filtered by a raw, interpolated status string.
 * The safe version is findAll({ status }) above.
 *
 * Payload: ?status=pending' OR '1'='1
 */
async function findByStatusRawUnsafe(status) {
  const sql = `
    SELECT ${ORDER_COLUMNS}
    FROM orders
    WHERE status = '${status}'
    ORDER BY placed_at DESC
    LIMIT 100
  `;
  const { rows } = await query(sql);
  return rows;
}

module.exports = {
  createOrder,
  findItemsByOrderIds,
  findByUser,
  findById,
  findByOrderNumber,
  findAll,
  updateStatus,
  stats,
  // Vulnerable-on-purpose export, isolated at the end of the list:
  findByStatusRawUnsafe,
};

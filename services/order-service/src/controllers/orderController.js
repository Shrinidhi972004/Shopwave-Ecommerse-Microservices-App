'use strict';

const model = require('../models/orderModel');
const { fetchCart, clearCart, decrementStock, restock } = require('../utils/serviceClient');
const { ApiError, asyncHandler } = require('../utils/ApiError');

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Which status transitions are legal. An order cannot un-deliver itself. */
const ALLOWED_TRANSITIONS = {
  pending: ['paid', 'processing', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function toApi(order, items = []) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    userId: order.user_id,
    status: order.status,
    subtotal: Number(order.subtotal),
    shipping: Number(order.shipping_cost),
    tax: Number(order.tax),
    total: Number(order.total_amount),
    currency: order.currency,
    shippingAddress: {
      fullName: order.ship_full_name,
      email: order.ship_email,
      phone: order.ship_phone,
      address1: order.ship_address1,
      address2: order.ship_address2,
      city: order.ship_city,
      state: order.ship_state,
      postalCode: order.ship_postal_code,
      country: order.ship_country,
    },
    paymentMethod: order.payment_method,
    notes: order.notes,
    placedAt: order.placed_at,
    updatedAt: order.updated_at,
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.product_name,
      imageUrl: i.product_image,
      unitPrice: Number(i.unit_price),
      quantity: i.quantity,
      lineTotal: Number(i.line_total),
    })),
  };
}

/** Attach line items to a list of orders with one extra query, not N. */
async function hydrate(orders) {
  const items = await model.findItemsByOrderIds(orders.map((o) => o.id));
  const byOrder = new Map();
  for (const item of items) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push(item);
  }
  return orders.map((o) => toApi(o, byOrder.get(o.id) || []));
}

/**
 * POST /api/orders  — place an order (checkout).
 *
 * Flow:
 *   1. Read the live cart from cart-service (authoritative prices, not client input).
 *   2. Reserve stock in product-service, one product at a time.
 *   3. Write the order + items in a single DB transaction.
 *   4. Clear the cart.
 *
 * On a stock failure in step 2, already-reserved units are released before the
 * error is returned, so a failed checkout doesn't strand inventory.
 *
 * NOTE: steps 2-4 span three services and are NOT atomic. A crash between
 * step 2 and 3 leaks reserved stock. The production fix is the saga pattern
 * with a compensating "release stock" event on an SQS/SNS queue — out of scope
 * here, but this is the seam where it goes.
 */
const placeOrder = asyncHandler(async (req, res) => {
  const token = bearer(req);
  const userId = req.user.id;
  const { shippingAddress, paymentMethod, notes } = req.body;

  // 1. Prices come from the cart service, never from the request body — that's
  //    what stops a client from POSTing { total: 0.01 }.
  const cart = await fetchCart(userId, token);
  if (!cart.items || cart.items.length === 0) {
    throw ApiError.badRequest('Your cart is empty');
  }

  const totals = {
    subtotal: round2(cart.summary.subtotal),
    shipping: round2(cart.summary.shipping),
    tax: round2(cart.summary.tax),
    total: round2(cart.summary.total),
  };

  // 2. Reserve stock.
  const reserved = [];
  try {
    for (const item of cart.items) {
      await decrementStock(item.productId, item.quantity, token);
      reserved.push(item);
    }
  } catch (err) {
    for (const item of reserved) {
      await restock(item.productId, item.quantity, token).catch((releaseErr) => {
        // Log loudly: this is inventory that needs manual reconciliation.
        console.error(
          `[order-service] FAILED to release ${item.quantity}x ${item.productId}:`,
          releaseErr.message
        );
      });
    }
    if (err.status === 409) {
      throw ApiError.conflict(
        'One or more items went out of stock while you were checking out. Please review your cart.'
      );
    }
    throw err;
  }

  // 3. Persist.
  const order = await model.createOrder({
    userId,
    totals,
    shipping: shippingAddress,
    paymentMethod,
    notes,
    items: cart.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      imageUrl: i.imageUrl,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
  });

  // 4. Clear the cart. A failure here is not fatal — the order is already
  //    committed, and a stale cart is far better than a lost order.
  await clearCart(userId, token).catch((err) => {
    console.error(`[order-service] Order ${order.order_number} placed but cart not cleared:`, err.message);
  });

  const items = await model.findItemsByOrderIds([order.id]);
  res.status(201).json({ order: toApi(order, items) });
});

/** GET /api/orders — the caller's own order history. */
const listMyOrders = asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.validatedQuery;
  const { orders, total } = await model.findByUser(req.user.id, { status, limit, offset });
  res.json({
    orders: await hydrate(orders),
    pagination: { total, limit, offset, hasMore: offset + orders.length < total },
  });
});

/** GET /api/orders/:id — own order, or any order for an admin. */
const getOrder = asyncHandler(async (req, res) => {
  const order = await model.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');

  // Ownership check. Without it, any authenticated user could read any order
  // by guessing an id — a classic IDOR.
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    throw ApiError.forbidden('You do not have access to this order');
  }

  const items = await model.findItemsByOrderIds([order.id]);
  res.json({ order: toApi(order, items) });
});

/** GET /api/orders/number/:orderNumber */
const getByOrderNumber = asyncHandler(async (req, res) => {
  const order = await model.findByOrderNumber(req.params.orderNumber);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    throw ApiError.forbidden('You do not have access to this order');
  }
  const items = await model.findItemsByOrderIds([order.id]);
  res.json({ order: toApi(order, items) });
});

/** POST /api/orders/:id/cancel — customers may cancel while still pending. */
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await model.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    throw ApiError.forbidden('You do not have access to this order');
  }
  if (!ALLOWED_TRANSITIONS[order.status].includes('cancelled')) {
    throw ApiError.badRequest(`An order that is already ${order.status} cannot be cancelled`);
  }

  const updated = await model.updateStatus(order.id, 'cancelled');

  // Return the reserved units to the catalogue.
  const items = await model.findItemsByOrderIds([order.id]);
  const token = bearer(req);
  for (const item of items) {
    await restock(item.product_id, item.quantity, token).catch((err) => {
      console.error(`[order-service] Failed to restock ${item.product_id}:`, err.message);
    });
  }

  res.json({ order: toApi(updated, items) });
});

// ─── Admin ──────────────────────────────────────────────────────────────────

/** GET /api/orders/admin/all */
const listAllOrders = asyncHandler(async (req, res) => {
  const { status, userId, limit, offset } = req.validatedQuery;
  const { orders, total } = await model.findAll({ status, userId, limit, offset });
  res.json({
    orders: await hydrate(orders),
    pagination: { total, limit, offset, hasMore: offset + orders.length < total },
  });
});

/** PATCH /api/orders/:id/status */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await model.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');

  if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
    throw ApiError.badRequest(
      `Cannot move an order from ${order.status} to ${status}. ` +
        `Allowed next: ${ALLOWED_TRANSITIONS[order.status].join(', ') || 'none'}`
    );
  }

  const updated = await model.updateStatus(order.id, status);
  const items = await model.findItemsByOrderIds([order.id]);
  res.json({ order: toApi(updated, items) });
});

/** GET /api/orders/admin/stats */
const getStats = asyncHandler(async (_req, res) => {
  const s = await model.stats();
  res.json({
    totalOrders: s.total_orders,
    revenue: round2(s.revenue),
    byStatus: {
      pending: s.pending,
      shipped: s.shipped,
      delivered: s.delivered,
      cancelled: s.cancelled,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️  DELIBERATELY VULNERABLE ENDPOINT — WAF TEST TARGET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/orders/admin/report?status=...
 *
 * VULNERABLE ON PURPOSE - for WAF testing
 *
 * No validateQuery(), and `status` is interpolated straight into the WHERE
 * clause. Still admin-gated, so exercising it needs an admin JWT — which makes
 * it a good test of WAF rules firing on authenticated traffic too.
 *
 * Payload: ?status=pending' OR '1'='1
 */
const adminReportUnsafe = asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';

  // VULNERABLE ON PURPOSE - for WAF testing: raw, unsanitised concatenation.
  const orders = await model.findByStatusRawUnsafe(status);

  res.json({
    orders: await hydrate(orders),
    count: orders.length,
    _warning: 'This endpoint is intentionally vulnerable to SQL injection (WAF test target).',
  });
});

module.exports = {
  placeOrder,
  listMyOrders,
  getOrder,
  getByOrderNumber,
  cancelOrder,
  listAllOrders,
  updateStatus,
  getStats,
  adminReportUnsafe,
};

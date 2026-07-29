'use strict';

const model = require('../models/cartModel');
const { fetchProductsByIds, fetchProduct } = require('../utils/serviceClient');
const { ApiError, asyncHandler } = require('../utils/ApiError');

/** Pull the caller's raw bearer token so we can forward it to product-service. */
function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Join cart rows with live product data from product-service and compute totals.
 *
 * Cart rows deliberately store only (user_id, product_id, quantity). Price and
 * name are NOT copied here — the cart must always reflect the current catalogue
 * price, and product-service is the single source of truth for that. Snapshots
 * happen at checkout, in order-service, not here.
 */
async function buildCart(userId, token) {
  const rows = await model.findByUser(userId);
  if (rows.length === 0) {
    return { items: [], summary: { itemCount: 0, subtotal: 0, shipping: 0, tax: 0, total: 0 }, unavailable: [] };
  }

  const productMap = await fetchProductsByIds(rows.map((r) => r.product_id), token);

  const items = [];
  const unavailable = [];

  for (const row of rows) {
    const product = productMap.get(row.product_id);

    // Product was deleted or deactivated after it was added to the cart.
    if (!product || !product.isActive) {
      unavailable.push({ productId: row.product_id, reason: 'no-longer-available' });
      continue;
    }

    // Cap the displayed quantity at available stock so checkout can't be
    // attempted with more units than exist.
    const quantity = Math.min(row.quantity, product.stock);
    if (quantity <= 0) {
      unavailable.push({ productId: row.product_id, name: product.name, reason: 'out-of-stock' });
      continue;
    }

    items.push({
      id: row.id,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      imageUrl: product.imageUrl,
      unitPrice: product.price,
      quantity,
      requestedQuantity: row.quantity,
      quantityAdjusted: quantity !== row.quantity,
      availableStock: product.stock,
      lineTotal: round2(product.price * quantity),
      addedAt: row.created_at,
    });
  }

  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  // Simple, explicit business rules — free shipping over $75, flat 8% tax.
  const shipping = subtotal === 0 || subtotal >= 75 ? 0 : 7.95;
  const tax = round2(subtotal * 0.08);
  const total = round2(subtotal + shipping + tax);

  return {
    items,
    summary: {
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      lineCount: items.length,
      subtotal,
      shipping,
      tax,
      total,
      freeShippingThreshold: 75,
      amountToFreeShipping: subtotal >= 75 ? 0 : round2(75 - subtotal),
    },
    unavailable,
  };
}

/** GET /api/cart */
const getCart = asyncHandler(async (req, res) => {
  res.json(await buildCart(req.user.id, bearer(req)));
});

/** GET /api/cart/count — cheap badge count, no product-service round trip. */
const getCount = asyncHandler(async (req, res) => {
  const counts = await model.countItems(req.user.id);
  res.json({ itemCount: counts.units, lineCount: counts.lines });
});

/** POST /api/cart/items  { productId, quantity } */
const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const token = bearer(req);

  // Validate against product-service before writing. Without this the cart can
  // accumulate rows pointing at products that never existed.
  const product = await fetchProduct(productId, token);
  if (!product) throw ApiError.notFound('Product not found');
  if (!product.isActive) throw ApiError.badRequest('This product is no longer available');

  const existing = await model.findItem(req.user.id, productId);
  const resultingQty = (existing?.quantity || 0) + quantity;

  if (resultingQty > product.stock) {
    throw ApiError.conflict(
      `Only ${product.stock} unit(s) available` +
        (existing ? ` and you already have ${existing.quantity} in your cart` : '')
    );
  }

  await model.upsertItem(req.user.id, productId, quantity);
  res.status(201).json(await buildCart(req.user.id, token));
});

/** PATCH /api/cart/items/:productId  { quantity } — absolute set. */
const updateItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const token = bearer(req);

  const existing = await model.findItem(req.user.id, productId);
  if (!existing) throw ApiError.notFound('That product is not in your cart');

  const product = await fetchProduct(productId, token);
  if (!product) throw ApiError.notFound('Product not found');
  if (quantity > product.stock) {
    throw ApiError.conflict(`Only ${product.stock} unit(s) available`);
  }

  await model.setQuantity(req.user.id, productId, quantity);
  res.json(await buildCart(req.user.id, token));
});

/** DELETE /api/cart/items/:productId */
const removeItem = asyncHandler(async (req, res) => {
  const removed = await model.removeItem(req.user.id, req.params.productId);
  if (!removed) throw ApiError.notFound('That product is not in your cart');
  res.json(await buildCart(req.user.id, bearer(req)));
});

/** DELETE /api/cart */
const clearCart = asyncHandler(async (req, res) => {
  const count = await model.clearCart(req.user.id);
  res.json({ message: `Removed ${count} item(s) from your cart`, items: [], summary: {
    itemCount: 0, lineCount: 0, subtotal: 0, shipping: 0, tax: 0, total: 0,
  }, unavailable: [] });
});

/**
 * POST /api/cart/merge
 * Merges a guest cart (held in browser localStorage) into the server cart after
 * login, so a user who filled a cart before signing in doesn't lose it.
 */
const mergeCart = asyncHandler(async (req, res) => {
  const token = bearer(req);
  const incoming = req.body.items;

  const ids = [...new Set(incoming.map((i) => i.productId).filter(Boolean))];
  const productMap = await fetchProductsByIds(ids, token);

  for (const item of incoming) {
    const product = productMap.get(item.productId);
    if (!product || !product.isActive) continue;

    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) continue;

    const existing = await model.findItem(req.user.id, item.productId);
    const target = Math.min((existing?.quantity || 0) + qty, product.stock);
    if (target < 1) continue;

    if (existing) await model.setQuantity(req.user.id, item.productId, target);
    else await model.upsertItem(req.user.id, item.productId, target);
  }

  res.json(await buildCart(req.user.id, token));
});

/**
 * GET /api/cart/internal/:userId
 * Service-to-service: order-service reads the cart at checkout.
 * Only an admin, or the user themselves, may call it.
 */
const getCartForService = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    throw ApiError.forbidden('Cannot read another user\'s cart');
  }
  res.json(await buildCart(userId, bearer(req)));
});

/**
 * DELETE /api/cart/internal/:userId
 * Service-to-service: order-service empties the cart once an order is placed.
 */
const clearCartForService = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    throw ApiError.forbidden('Cannot modify another user\'s cart');
  }
  const count = await model.clearCart(userId);
  res.json({ cleared: count });
});

module.exports = {
  getCart,
  getCount,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeCart,
  getCartForService,
  clearCartForService,
};

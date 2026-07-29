'use strict';

const express = require('express');
const ctrl = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams } = require('../utils/validate');

const router = express.Router();

// Orders always belong to somebody — no anonymous access anywhere here.
router.use(requireAuth);

const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

const shippingSchema = {
  fullName: { type: 'string', required: true, minLength: 2, maxLength: 120 },
  email: { type: 'email', required: true, maxLength: 255 },
  phone: { type: 'string', maxLength: 40 },
  address1: { type: 'string', required: true, minLength: 4, maxLength: 200 },
  address2: { type: 'string', maxLength: 200 },
  city: { type: 'string', required: true, minLength: 2, maxLength: 100 },
  state: { type: 'string', maxLength: 100 },
  postalCode: { type: 'string', required: true, minLength: 3, maxLength: 20 },
  country: { type: 'string', required: true, minLength: 2, maxLength: 80 },
};

/**
 * Note what is NOT here: no totals, no line items, no prices. The client only
 * says where to ship and how to pay — the order contents and every monetary
 * figure are read server-side from cart-service. A client that POSTs
 * `{ total: 0.01 }` simply has that field discarded by the whitelist.
 */
const placeOrderSchema = {
  shippingAddress: { type: 'object', required: true, schema: shippingSchema },
  paymentMethod: { type: 'string', enum: ['cod', 'card', 'paypal'], default: 'cod' },
  notes: { type: 'string', maxLength: 500 },
};

const listMineSchema = {
  status: { type: 'string', enum: ORDER_STATUSES },
  limit: { type: 'int', min: 1, max: 50, default: 20 },
  offset: { type: 'int', min: 0, default: 0 },
};

const listAllSchema = {
  status: { type: 'string', enum: ORDER_STATUSES },
  userId: { type: 'uuid' },
  limit: { type: 'int', min: 1, max: 100, default: 50 },
  offset: { type: 'int', min: 0, default: 0 },
};

const idParamSchema = { id: { type: 'uuid', required: true } };

const statusSchema = {
  status: { type: 'string', required: true, enum: ORDER_STATUSES },
};

// ─── Admin ──────────────────────────────────────────────────────────────────
// Registered before /:id so "admin" is not captured as an order id.
router.get('/admin/all', requireRole('admin'), validateQuery(listAllSchema), ctrl.listAllOrders);
router.get('/admin/stats', requireRole('admin'), ctrl.getStats);

// ⚠️ VULNERABLE ON PURPOSE - for WAF testing. Note the missing validateQuery().
router.get('/admin/report', requireRole('admin'), ctrl.adminReportUnsafe);

// ─── Customer ───────────────────────────────────────────────────────────────
router.post('/', validateBody(placeOrderSchema), ctrl.placeOrder);
router.get('/', validateQuery(listMineSchema), ctrl.listMyOrders);
router.get('/number/:orderNumber', ctrl.getByOrderNumber);
router.get('/:id', validateParams(idParamSchema), ctrl.getOrder);
router.post('/:id/cancel', validateParams(idParamSchema), ctrl.cancelOrder);

// ─── Admin status transitions ───────────────────────────────────────────────
router.patch(
  '/:id/status',
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(statusSchema),
  ctrl.updateStatus
);

module.exports = router;

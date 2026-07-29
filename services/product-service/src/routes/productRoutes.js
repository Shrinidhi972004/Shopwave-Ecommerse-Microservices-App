'use strict';

const express = require('express');
const ctrl = require('../controllers/productController');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams } = require('../utils/validate');

const router = express.Router();

const SORT_KEYS = ['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'rating'];

const listSchema = {
  category: { type: 'string', maxLength: 80 },
  search: { type: 'string', maxLength: 120 },
  brand: { type: 'string', maxLength: 80 },
  minPrice: { type: 'number', min: 0, max: 1_000_000 },
  maxPrice: { type: 'number', min: 0, max: 1_000_000 },
  inStock: { type: 'boolean' },
  includeInactive: { type: 'boolean', default: false },
  sort: { type: 'string', enum: SORT_KEYS, default: 'newest' },
  limit: { type: 'int', min: 1, max: 100, default: 20 },
  offset: { type: 'int', min: 0, default: 0 },
};

const idParamSchema = {
  id: { type: 'uuid', required: true },
};

const batchSchema = {
  ids: { type: 'array', required: true, minLength: 1, maxLength: 100 },
};

const createSchema = {
  name: { type: 'string', required: true, minLength: 2, maxLength: 200 },
  description: { type: 'string', maxLength: 5000, default: '' },
  brand: { type: 'string', maxLength: 80 },
  price: { type: 'number', required: true, min: 0, max: 1_000_000 },
  imageUrl: { type: 'string', required: true, maxLength: 2048, pattern: /^https?:\/\//i,
              patternMessage: 'imageUrl must be an http(s) URL' },
  stock: { type: 'int', min: 0, max: 1_000_000, default: 0 },
  categoryId: { type: 'int', min: 1 },
  sku: { type: 'string', maxLength: 40 },
  slug: { type: 'string', maxLength: 220 },
  isActive: { type: 'boolean', default: true },
};

// Same fields, nothing required — this is a PATCH.
const updateSchema = Object.fromEntries(
  Object.entries(createSchema).map(([k, v]) => [k, { ...v, required: false, default: undefined }])
);

const decrementSchema = {
  quantity: { type: 'int', required: true, min: 1, max: 1000 },
};

const createCategorySchema = {
  name: { type: 'string', required: true, minLength: 2, maxLength: 80 },
  slug: { type: 'string', maxLength: 80 },
  description: { type: 'string', maxLength: 500 },
};

// ─── Public reads ───────────────────────────────────────────────────────────

// ⚠️ VULNERABLE ON PURPOSE - for WAF testing.
// Registered BEFORE /:id so "search" is not swallowed by the id route. Note the
// deliberate absence of validateQuery() — every other route below has one.
router.get('/search', ctrl.searchUnsafe);
router.get('/legacy-list', ctrl.legacyListUnsafe);

router.get('/meta/filters', ctrl.filterMeta);
router.post('/batch', validateBody(batchSchema), ctrl.getBatch);

router.get('/', optionalAuth, validateQuery(listSchema), ctrl.list);
router.get('/:id', optionalAuth, ctrl.getOne); // id may be a UUID or a slug

// ─── Service-to-service ─────────────────────────────────────────────────────
// Called by order-service at checkout. Requires a valid JWT so it is not open
// to the internet; in the K8s deployment also restrict it with a NetworkPolicy.
router.post(
  '/:id/decrement-stock',
  requireAuth,
  validateParams(idParamSchema),
  validateBody(decrementSchema),
  ctrl.decrementStock
);

router.post(
  '/:id/restock',
  requireAuth,
  validateParams(idParamSchema),
  validateBody(decrementSchema),
  ctrl.restock
);

// ─── Admin writes ───────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin'), validateBody(createSchema), ctrl.create);
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(updateSchema),
  ctrl.update
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(idParamSchema),
  ctrl.remove
);

// ─── Categories (mounted separately at /api/categories in app.js) ───────────
const categoryRouter = express.Router();
categoryRouter.get('/', ctrl.listCategories);
categoryRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validateBody(createCategorySchema),
  ctrl.createCategory
);

module.exports = { productRouter: router, categoryRouter };

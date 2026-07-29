'use strict';

const express = require('express');
const ctrl = require('../controllers/cartController');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateParams } = require('../utils/validate');

const router = express.Router();

// Every cart route is per-user, so authentication is required across the board.
router.use(requireAuth);

const addItemSchema = {
  productId: { type: 'uuid', required: true },
  quantity: { type: 'int', min: 1, max: 99, default: 1 },
};

const updateItemSchema = {
  quantity: { type: 'int', required: true, min: 1, max: 99 },
};

const productIdParamSchema = {
  productId: { type: 'uuid', required: true },
};

const userIdParamSchema = {
  userId: { type: 'uuid', required: true },
};

const mergeSchema = {
  items: { type: 'array', required: true, maxLength: 100 },
};

router.get('/', ctrl.getCart);
router.get('/count', ctrl.getCount);
router.delete('/', ctrl.clearCart);

router.post('/items', validateBody(addItemSchema), ctrl.addItem);
router.patch(
  '/items/:productId',
  validateParams(productIdParamSchema),
  validateBody(updateItemSchema),
  ctrl.updateItem
);
router.delete('/items/:productId', validateParams(productIdParamSchema), ctrl.removeItem);

router.post('/merge', validateBody(mergeSchema), ctrl.mergeCart);

// ─── Service-to-service ─────────────────────────────────────────────────────
router.get('/internal/:userId', validateParams(userIdParamSchema), ctrl.getCartForService);
router.delete('/internal/:userId', validateParams(userIdParamSchema), ctrl.clearCartForService);

module.exports = router;

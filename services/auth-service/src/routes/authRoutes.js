'use strict';

const express = require('express');
const ctrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../utils/validate');

const router = express.Router();

// Password policy: 8+ chars with at least one letter and one digit.
const PASSWORD_RULE = {
  type: 'string',
  required: true,
  minLength: 8,
  maxLength: 128,
  trim: false, // a leading/trailing space is a legitimate password character
  pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
  patternMessage: 'password must be at least 8 characters and include a letter and a number',
};

const registerSchema = {
  email: { type: 'email', required: true, maxLength: 255 },
  password: PASSWORD_RULE,
  fullName: { type: 'string', required: true, minLength: 2, maxLength: 120 },
};

const loginSchema = {
  email: { type: 'email', required: true, maxLength: 255 },
  password: { type: 'string', required: true, maxLength: 128, trim: false },
};

const updateMeSchema = {
  fullName: { type: 'string', required: true, minLength: 2, maxLength: 120 },
};

const changePasswordSchema = {
  currentPassword: { type: 'string', required: true, maxLength: 128, trim: false },
  newPassword: PASSWORD_RULE,
};

const verifySchema = {
  token: { type: 'string', required: true, maxLength: 4096 },
};

const listUsersSchema = {
  limit: { type: 'int', min: 1, max: 100, default: 50 },
  offset: { type: 'int', min: 0, default: 0 },
};

// ─── Public ─────────────────────────────────────────────────────────────────
router.post('/register', validateBody(registerSchema), ctrl.register);
router.post('/login', validateBody(loginSchema), ctrl.login);
router.post('/verify', validateBody(verifySchema), ctrl.verify);

// ─── Protected ──────────────────────────────────────────────────────────────
router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validateBody(updateMeSchema), ctrl.updateMe);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), ctrl.changePassword);

// ─── Admin ──────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireRole('admin'), validateQuery(listUsersSchema), ctrl.listUsers);

module.exports = router;

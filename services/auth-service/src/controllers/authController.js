'use strict';

const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { signToken } = require('../utils/jwt');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const config = require('../config/env');

/** Shape a DB row into the JSON the frontend expects. */
function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * POST /api/auth/register
 * Body validated upstream by validateBody(registerSchema).
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, fullName } = req.body;

  if (await userModel.emailExists(email)) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  // NOTE: `role` is hard-coded to 'customer'. It is deliberately NOT taken from
  // the request body — otherwise anyone could register themselves as an admin.
  // Admin accounts are created via seed.sql or promoted by an existing admin.
  const user = await userModel.create({ email, passwordHash, fullName, role: 'customer' });

  const token = signToken(user);
  res.status(201).json({ token, user: toPublicUser(user) });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);

  // Constant-ish response: never reveal whether it was the email or the
  // password that was wrong, and always run a bcrypt comparison so the timing
  // of "unknown email" matches "wrong password".
  if (!user) {
    await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.is_active) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
});

/**
 * GET /api/auth/me   (protected)
 * Returns the current user, re-read from the DB rather than trusted from the
 * token — so a deactivated or deleted account stops working immediately.
 */
const me = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('User no longer exists');
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');
  res.json({ user: toPublicUser(user) });
});

/**
 * PATCH /api/auth/me   (protected)
 */
const updateMe = asyncHandler(async (req, res) => {
  const updated = await userModel.updateProfile(req.user.id, { fullName: req.body.fullName });
  if (!updated) throw ApiError.notFound('User no longer exists');
  res.json({ user: toPublicUser(updated) });
});

/**
 * POST /api/auth/change-password   (protected)
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await userModel.findByEmail(req.user.email);
  if (!user) throw ApiError.notFound('User no longer exists');

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must be different from the current one');
  }

  await userModel.updatePassword(user.id, await bcrypt.hash(newPassword, config.bcryptRounds));
  res.json({ message: 'Password updated successfully' });
});

/**
 * POST /api/auth/verify   (service-to-service)
 * Lets another microservice validate a token without sharing verification
 * logic. The services normally verify locally; this exists as an escape hatch
 * and for debugging.
 */
const verify = asyncHandler(async (req, res) => {
  const { verifyToken } = require('../utils/jwt');
  try {
    const payload = verifyToken(req.body.token);
    const user = await userModel.findById(payload.sub);
    if (!user || !user.is_active) throw new Error('inactive');
    res.json({ valid: true, user: toPublicUser(user) });
  } catch {
    res.status(401).json({ valid: false });
  }
});

/**
 * GET /api/auth/users   (admin only)
 */
const listUsers = asyncHandler(async (req, res) => {
  const { limit, offset } = req.validatedQuery;
  const users = await userModel.listAll({ limit, offset });
  res.json({ users: users.map(toPublicUser), count: users.length });
});

module.exports = { register, login, me, updateMe, changePassword, verify, listUsers };

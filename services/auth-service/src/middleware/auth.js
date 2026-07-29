'use strict';

const { verifyToken } = require('../utils/jwt');
const { ApiError } = require('../utils/ApiError');

/**
 * Requires a valid `Authorization: Bearer <jwt>` header.
 * On success attaches `req.user = { id, email, role }`.
 *
 * Every service carries its own copy of this middleware and verifies the token
 * signature locally — no network call back to auth-service on each request.
 * That is what makes the services independently deployable.
 */
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  const token = header.slice(7).trim();
  if (!token) return next(ApiError.unauthorized('Bearer token is empty'));

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Session expired, please log in again'));
    }
    return next(ApiError.unauthorized('Invalid authentication token'));
  }
}

/** Requires an authenticated user whose role is in `roles`. Use after requireAuth. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('This action requires elevated privileges'));
    }
    return next();
  };
}

/** Attaches req.user when a valid token is present, but never rejects. */
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = verifyToken(header.slice(7).trim());
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    /* ignore — treat as anonymous */
  }
  return next();
}

module.exports = { requireAuth, requireRole, optionalAuth };

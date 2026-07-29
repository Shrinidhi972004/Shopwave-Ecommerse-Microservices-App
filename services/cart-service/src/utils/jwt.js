'use strict';

const jwt = require('jsonwebtoken');
const config = require('./../config/env');

/**
 * Verify-only. This service never issues tokens — that is auth-service's job.
 * It validates the signature locally with the shared secret, so no network
 * round-trip to auth-service is needed on the request path.
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer });
}

module.exports = { verifyToken };

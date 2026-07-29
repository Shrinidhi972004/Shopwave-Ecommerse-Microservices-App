'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Issues an access token.
 *
 * Claims are deliberately minimal — id, email, role. Never put anything in a
 * JWT you would not show the user: the payload is base64, not encrypted.
 */
function signToken(user) {
  return jwt.sign(
    {
      email: user.email,
      role: user.role,
      name: user.full_name,
    },
    config.jwtSecret,
    {
      subject: String(user.id),
      expiresIn: config.jwtExpiresIn,
      issuer: config.jwtIssuer,
    }
  );
}

/** Verifies signature, expiry, and issuer. Throws on any failure. */
function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer });
}

module.exports = { signToken, verifyToken };

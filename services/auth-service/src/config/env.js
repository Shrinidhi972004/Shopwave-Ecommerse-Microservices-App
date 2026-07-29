'use strict';

/**
 * Loads .env and validates required config at boot.
 * Failing fast here beats discovering a missing JWT_SECRET on the first login.
 */

require('dotenv').config();

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[auth-service] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill it in.'
  );
  process.exit(1);
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.JWT_SECRET.startsWith('dev-only-secret')
) {
  console.error('[auth-service] Refusing to start in production with the example JWT_SECRET.');
  process.exit(1);
}

module.exports = {
  serviceName: 'auth-service',
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4001,

  databaseUrl: process.env.DATABASE_URL,
  pgSsl: process.env.PGSSL === 'true',

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  jwtIssuer: process.env.JWT_ISSUER || 'shopwave-auth',

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

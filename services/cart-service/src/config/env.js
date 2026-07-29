'use strict';

/**
 * Loads .env and validates required config at boot.
 * Failing fast here beats discovering a missing JWT_SECRET on the first request.
 */

require('dotenv').config();

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[cart-service] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill it in.'
  );
  process.exit(1);
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.JWT_SECRET.startsWith('dev-only-secret')
) {
  console.error('[cart-service] Refusing to start in production with the example JWT_SECRET.');
  process.exit(1);
}

module.exports = {
  serviceName: 'cart-service',
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4003,

  databaseUrl: process.env.DATABASE_URL,
  pgSsl: process.env.PGSSL === 'true',

  // Must match auth-service exactly — this service verifies tokens auth issues.
  jwtSecret: process.env.JWT_SECRET,
  jwtIssuer: process.env.JWT_ISSUER || 'shopwave-auth',

  // Upstream microservices this service calls.
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  productServiceUrl: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002',
  cartServiceUrl: process.env.CART_SERVICE_URL || 'http://localhost:4003',
  orderServiceUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:4004',

  // Timeout for service-to-service HTTP calls, in ms.
  httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS) || 5000,

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

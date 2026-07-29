'use strict';

/**
 * cart-service entry point.
 *   npm start      production
 *   npm run dev    with --watch reload
 */

const app = require('./src/app');
const config = require('./src/config/env');
const { pool, assertConnection } = require('./src/config/db');

async function main() {
  try {
    await assertConnection();
    console.log('[cart-service] Database connection OK');
  } catch (err) {
    console.error(`[cart-service] Cannot reach the database: ${err.message}`);
    console.error('[cart-service] Check DATABASE_URL, and that schema.sql has been applied.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[cart-service] Listening on http://localhost:${config.port} (${config.env})`);
    console.log(`[cart-service] Health: http://localhost:${config.port}/health`);
  });

  // Graceful shutdown: stop accepting connections, drain, then close the pool.
  // Kubernetes sends SIGTERM, so honouring it avoids dropped requests on deploy.
  const shutdown = (signal) => async () => {
    console.log(`[cart-service] ${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      console.log('[cart-service] Closed cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[cart-service] Forced shutdown after 10s');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[cart-service] Unhandled promise rejection:', reason);
});

main();

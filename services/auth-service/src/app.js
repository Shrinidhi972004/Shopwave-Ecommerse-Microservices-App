'use strict';

const express = require('express');
const cors = require('cors');

const config = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const { rateLimit } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Behind an ALB / CloudFront, trust X-Forwarded-* so req.ip is the real client.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser callers (curl, other services) which send no Origin.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' }));

// Lightweight request log. Swap for structured JSON logging before production
// so CloudWatch Logs Insights can query it.
if (config.env !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[auth] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
      );
    });
    next();
  });
}

// ─── Health checks ──────────────────────────────────────────────────────────
// /health is a liveness probe: is the process up? Keep it dependency-free so
// a database blip does not cause the orchestrator to kill a healthy pod.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: config.serviceName, uptime: process.uptime() });
});

// /ready is a readiness probe: can this instance actually serve traffic?
app.get('/ready', async (_req, res) => {
  const { assertConnection } = require('./config/db');
  try {
    await assertConnection();
    res.json({ status: 'ready', service: config.serviceName, database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', service: config.serviceName, error: err.message });
  }
});

// ─── Routes ─────────────────────────────────────────────────────────────────
// 20 auth attempts per minute per IP, applied before the router so it covers
// login, register, and verify alike.
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }), authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

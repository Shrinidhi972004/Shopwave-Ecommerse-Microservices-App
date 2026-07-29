'use strict';

const express = require('express');
const cors = require('cors');

const config = require('./config/env');
const { productRouter, categoryRouter } = require('./routes/productRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));

if (config.env !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[product] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
      );
    });
    next();
  });
}

// ─── Health checks ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: config.serviceName, uptime: process.uptime() });
});

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
app.use('/api/products', productRouter);
app.use('/api/categories', categoryRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

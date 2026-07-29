'use strict';

const { ApiError } = require('../utils/ApiError');

/**
 * Dependency-free fixed-window rate limiter.
 *
 * In-process only, so it resets on restart and does NOT coordinate across
 * replicas. That is fine here — it exists to blunt credential stuffing against
 * a single instance. Once this runs on Kubernetes with multiple pods, move the
 * counter to Redis/ElastiCache, or let AWS WAF rate-based rules handle it.
 */
function rateLimit({ windowMs = 60_000, max = 20, message } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Bound memory: drop expired buckets every window.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweeper.unref?.(); // never hold the event loop open

  return (req, res, next) => {
    // Behind an ALB/CloudFront, app.set('trust proxy', true) makes req.ip the
    // real client IP rather than the load balancer's.
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let bucket = hits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }
    bucket.count += 1;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return next(new ApiError(429, message || 'Too many requests, please slow down'));
    }
    return next();
  };
}

module.exports = { rateLimit };

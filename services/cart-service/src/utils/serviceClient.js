'use strict';

const config = require('../config/env');
const { ApiError } = require('./ApiError');

/**
 * Thin HTTP client for service-to-service calls.
 *
 * Uses Node 18+'s built-in fetch, so no axios dependency in the backend — the
 * frontend uses axios, the services do not need it.
 *
 * Every call is time-boxed with AbortSignal: without a timeout, one slow
 * downstream service turns into every upstream service exhausting its socket
 * pool, and the whole storefront falls over.
 */
async function callService(url, { method = 'GET', body, token, timeoutMs } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || config.httpTimeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = data?.error?.message || `Upstream call failed (${response.status})`;
      // Preserve 4xx from downstream (a real client error) but collapse 5xx
      // into 502 — the client did nothing wrong, our dependency did.
      throw new ApiError(response.status < 500 ? response.status : 502, message);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') {
      throw new ApiError(504, `Upstream service timed out: ${url}`);
    }
    throw new ApiError(502, `Cannot reach upstream service: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve many products in one request.
 * Returns a Map keyed by product id for O(1) joins against cart rows.
 */
async function fetchProductsByIds(ids, token) {
  if (!ids.length) return new Map();
  const data = await callService(`${config.productServiceUrl}/api/products/batch`, {
    method: 'POST',
    body: { ids },
    token,
  });
  return new Map((data.products || []).map((p) => [p.id, p]));
}

/** Fetch a single product; returns null on 404 rather than throwing. */
async function fetchProduct(id, token) {
  try {
    const data = await callService(`${config.productServiceUrl}/api/products/${id}`, { token });
    return data.product;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

module.exports = { callService, fetchProductsByIds, fetchProduct };

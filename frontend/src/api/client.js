import axios from 'axios';

/**
 * One axios instance per microservice.
 *
 * Base URLs are read from Vite env vars so the same bundle can be pointed at
 * localhost, a staging ALB, or production CloudFront by rebuilding with a
 * different .env — no code change.
 *
 * If VITE_API_GATEWAY_URL is set, all four services are addressed through that
 * one origin instead. No prefix is added here: every request path below
 * already starts with /api/<service>, which is exactly what the ALB Ingress
 * routes on (/api/auth, /api/products, /api/categories, /api/cart,
 * /api/orders). Adding a second prefix would produce /products/api/products
 * and miss every rule.
 */

const gateway = import.meta.env.VITE_API_GATEWAY_URL;

const BASE_URLS = gateway
  ? {
      auth: gateway,
      product: gateway,
      cart: gateway,
      order: gateway,
    }
  : {
      auth: import.meta.env.VITE_AUTH_API_URL || 'http://localhost:4001',
      product: import.meta.env.VITE_PRODUCT_API_URL || 'http://localhost:4002',
      cart: import.meta.env.VITE_CART_API_URL || 'http://localhost:4003',
      order: import.meta.env.VITE_ORDER_API_URL || 'http://localhost:4004',
    };

const TOKEN_KEY = 'shopwave.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Called by AuthContext when a request comes back 401, so the app can drop the
 * dead session and bounce the user to /login. Registered via a setter rather
 * than imported directly, to avoid a circular import between context and api.
 */
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

/** Normalises every backend error into a predictable shape for the UI. */
export class ApiError extends Error {
  constructor(message, { status, details, isNetwork = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || [];
    this.isNetwork = isNetwork;
  }

  /** Field name -> message, for inline form validation. */
  get fieldErrors() {
    return this.details.reduce((acc, d) => {
      if (d.field) acc[d.field] = d.message;
      return acc;
    }, {});
  }
}

function createClient(baseURL) {
  const instance = axios.create({
    baseURL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      // The server never responded — DNS failure, CORS block, service down.
      if (!error.response) {
        return Promise.reject(
          new ApiError(
            error.code === 'ECONNABORTED'
              ? 'The request timed out. Please try again.'
              : 'Cannot reach the server. Is the service running?',
            { isNetwork: true }
          )
        );
      }

      const { status, data } = error.response;

      // Session is gone or invalid — clear it once, centrally.
      if (status === 401) {
        tokenStore.clear();
        onUnauthorized();
      }

      return Promise.reject(
        new ApiError(data?.error?.message || `Request failed (${status})`, {
          status,
          details: data?.error?.details,
        })
      );
    }
  );

  return instance;
}

export const authApi = createClient(BASE_URLS.auth);
export const productApi = createClient(BASE_URLS.product);
export const cartApi = createClient(BASE_URLS.cart);
export const orderApi = createClient(BASE_URLS.order);

export { BASE_URLS };

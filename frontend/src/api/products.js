import { productApi } from './client';

export const productService = {
  /**
   * `params` is passed through as a query string; undefined values are dropped
   * by axios, so callers can spread a filter object without pruning it first.
   */
  list: (params) => productApi.get('/api/products', { params }).then((r) => r.data),

  /** Accepts a UUID or a slug. */
  get: (idOrSlug) => productApi.get(`/api/products/${idOrSlug}`).then((r) => r.data.product),

  /** Categories, brands, and the min/max price — powers the filter sidebar. */
  filterMeta: () => productApi.get('/api/products/meta/filters').then((r) => r.data),

  categories: () => productApi.get('/api/categories').then((r) => r.data.categories),

  create: (payload) => productApi.post('/api/products', payload).then((r) => r.data.product),
  update: (id, payload) =>
    productApi.patch(`/api/products/${id}`, payload).then((r) => r.data.product),
  remove: (id) => productApi.delete(`/api/products/${id}`),

  /**
   * Hits the deliberately-vulnerable endpoint. Not used by the storefront UI —
   * the normal search box goes through list({ search }), which is parameterised.
   * Exposed here only so the WAF test page can exercise it from the browser.
   */
  searchUnsafe: (q) => productApi.get('/api/products/search', { params: { q } }).then((r) => r.data),
};

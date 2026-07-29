import { cartApi } from './client';

export const cartService = {
  get: () => cartApi.get('/api/cart').then((r) => r.data),
  count: () => cartApi.get('/api/cart/count').then((r) => r.data),
  addItem: (productId, quantity = 1) =>
    cartApi.post('/api/cart/items', { productId, quantity }).then((r) => r.data),
  updateItem: (productId, quantity) =>
    cartApi.patch(`/api/cart/items/${productId}`, { quantity }).then((r) => r.data),
  removeItem: (productId) => cartApi.delete(`/api/cart/items/${productId}`).then((r) => r.data),
  clear: () => cartApi.delete('/api/cart').then((r) => r.data),
  /** Pushes a guest cart held in localStorage up to the server after login. */
  merge: (items) => cartApi.post('/api/cart/merge', { items }).then((r) => r.data),
};

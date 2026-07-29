import { orderApi } from './client';

export const orderService = {
  place: (payload) => orderApi.post('/api/orders', payload).then((r) => r.data.order),
  listMine: (params) => orderApi.get('/api/orders', { params }).then((r) => r.data),
  get: (id) => orderApi.get(`/api/orders/${id}`).then((r) => r.data.order),
  cancel: (id) => orderApi.post(`/api/orders/${id}/cancel`).then((r) => r.data.order),

  // Admin
  listAll: (params) => orderApi.get('/api/orders/admin/all', { params }).then((r) => r.data),
  stats: () => orderApi.get('/api/orders/admin/stats').then((r) => r.data),
  updateStatus: (id, status) =>
    orderApi.patch(`/api/orders/${id}/status`, { status }).then((r) => r.data.order),
};

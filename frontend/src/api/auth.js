import { authApi } from './client';

export const authService = {
  register: (payload) => authApi.post('/api/auth/register', payload).then((r) => r.data),
  login: (payload) => authApi.post('/api/auth/login', payload).then((r) => r.data),
  me: () => authApi.get('/api/auth/me').then((r) => r.data.user),
  updateProfile: (payload) => authApi.patch('/api/auth/me', payload).then((r) => r.data.user),
  changePassword: (payload) =>
    authApi.post('/api/auth/change-password', payload).then((r) => r.data),
  listUsers: (params) => authApi.get('/api/auth/users', { params }).then((r) => r.data),
};

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authService } from '../api/auth';
import { tokenStore, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `initialising` distinguishes "we haven't checked yet" from "logged out",
  // so protected routes don't flash the login page on a hard refresh.
  const [initialising, setInitialising] = useState(true);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    localStorage.removeItem('shopwave.guestCart');
  }, []);

  // Any 401 from any service drops the session exactly once, centrally.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  // Restore the session on load: a token in localStorage is only a claim, so
  // it is verified against auth-service before we trust it.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokenStore.get()) {
        setInitialising(false);
        return;
      }
      try {
        const me = await authService.me();
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { token, user: loggedIn } = await authService.login(credentials);
    tokenStore.set(token);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: created } = await authService.register(payload);
    tokenStore.set(token);
    setUser(created);
    return created;
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const updated = await authService.updateProfile(payload);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initialising,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, initialising, login, register, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { classNames } from '../utils/format';

const ToastContext = createContext(null);

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, variant = 'success', duration = 3500) => {
      const id = ++nextId;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (msg) => push(msg, 'success'),
      error: (msg) => push(msg, 'error', 5000),
      info: (msg) => push(msg, 'info'),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* aria-live so screen readers announce toasts without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={classNames(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lift',
              'animate-[fadeIn_150ms_ease-out]',
              t.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              t.variant === 'error' && 'border-red-200 bg-red-50 text-red-900',
              t.variant === 'info' && 'border-brand-200 bg-brand-50 text-brand-900'
            )}
          >
            <span aria-hidden="true" className="mt-0.5 text-base leading-none">
              {t.variant === 'success' ? '✓' : t.variant === 'error' ? '!' : 'i'}
            </span>
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-lg leading-none opacity-50 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

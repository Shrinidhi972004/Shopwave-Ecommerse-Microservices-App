import { classNames } from '../utils/format';

/** Small presentational primitives shared across pages. */

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={classNames('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner className="h-8 w-8" />
      <p className="text-sm font-medium">{label}…</p>
    </div>
  );
}

export function Rating({ value = 0, count, size = 'sm' }) {
  const rounded = Math.round(value * 2) / 2;
  const dimension = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex" role="img" aria-label={`Rated ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={classNames(dimension, rounded >= star ? 'text-amber-400' : 'text-ink-200')}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.34 4.12a1 1 0 00.95.69h4.34c.97 0 1.37 1.24.59 1.81l-3.51 2.55a1 1 0 00-.36 1.12l1.34 4.12c.3.92-.75 1.69-1.54 1.12l-3.5-2.55a1 1 0 00-1.18 0l-3.5 2.55c-.79.57-1.84-.2-1.54-1.12l1.34-4.12a1 1 0 00-.36-1.12L2.83 9.55c-.79-.57-.38-1.81.58-1.81h4.34a1 1 0 00.95-.69l1.34-4.12z" />
          </svg>
        ))}
      </div>
      {count !== undefined && (
        <span className="text-xs text-ink-500">
          {value.toFixed(1)} ({count})
        </span>
      )}
    </div>
  );
}

export function EmptyState({ icon = '🛍️', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-white/60 px-6 py-16 text-center">
      <span className="mb-4 text-4xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
      <p className="text-sm font-semibold text-red-900">Something went wrong</p>
      <p className="mt-1 text-sm text-red-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, disabled = false }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
        className="px-3 py-1.5 text-ink-600 transition-colors hover:text-ink-900 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
        className="px-3 py-1.5 text-ink-600 transition-colors hover:text-ink-900 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const current = Math.floor(offset / limit) + 1;

  // Show at most 5 page buttons, centred on the current page.
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange((current - 2) * limit)}
        disabled={current === 1}
        className="btn-secondary px-3 py-1.5 text-xs"
      >
        Previous
      </button>

      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onChange((page - 1) * limit)}
          aria-current={page === current ? 'page' : undefined}
          className={classNames(
            'h-9 w-9 rounded-lg text-sm font-semibold transition-colors',
            page === current
              ? 'bg-ink-900 text-white'
              : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
          )}
        >
          {page}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChange(current * limit)}
        disabled={current === totalPages}
        className="btn-secondary px-3 py-1.5 text-xs"
      >
        Next
      </button>
    </nav>
  );
}

export function StatusBadge({ status, styles, labels }) {
  return (
    <span className={classNames('badge', styles[status] || 'bg-ink-100 text-ink-700')}>
      {labels[status] || status}
    </span>
  );
}

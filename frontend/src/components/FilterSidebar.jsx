import { useState, useEffect } from 'react';
import { classNames, formatPrice } from '../utils/format';

/**
 * Faceted filter panel.
 *
 * Fully controlled — it holds no filter state of its own beyond the price
 * inputs (which are local only so typing "1" in a min-price field doesn't fire
 * a request for everything over $1 before you finish typing "150").
 */
export default function FilterSidebar({ meta, filters, onChange, onReset, resultCount }) {
  const [minPrice, setMinPrice] = useState(filters.minPrice ?? '');
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice ?? '');

  useEffect(() => {
    setMinPrice(filters.minPrice ?? '');
    setMaxPrice(filters.maxPrice ?? '');
  }, [filters.minPrice, filters.maxPrice]);

  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0);

  function applyPrice(event) {
    event.preventDefault();
    onChange({
      minPrice: minPrice === '' ? undefined : Number(minPrice),
      maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
    });
  }

  return (
    <aside className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Filters</h2>
        {activeCount > 0 && (
          <button type="button" onClick={onReset} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {resultCount !== undefined && (
        <p className="text-xs text-ink-500">
          {resultCount} {resultCount === 1 ? 'product' : 'products'}
        </p>
      )}

      {/* Categories */}
      <fieldset>
        <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">
          Category
        </legend>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onChange({ category: undefined })}
            className={classNames(
              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
              !filters.category ? 'bg-ink-900 font-semibold text-white' : 'text-ink-700 hover:bg-ink-100'
            )}
          >
            All products
          </button>

          {(meta?.categories || []).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange({ category: category.slug })}
              className={classNames(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                filters.category === category.slug
                  ? 'bg-ink-900 font-semibold text-white'
                  : 'text-ink-700 hover:bg-ink-100'
              )}
            >
              <span>{category.name}</span>
              <span
                className={classNames(
                  'text-xs',
                  filters.category === category.slug ? 'text-white/60' : 'text-ink-400'
                )}
              >
                {category.productCount}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Price */}
      <fieldset className="border-t border-ink-200 pt-5">
        <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">
          Price
        </legend>

        {meta?.priceRange && (
          <p className="mb-3 text-xs text-ink-400">
            {formatPrice(meta.priceRange.min)} – {formatPrice(meta.priceRange.max)}
          </p>
        )}

        <form onSubmit={applyPrice} className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min"
            aria-label="Minimum price"
            className="input px-2.5 py-1.5 text-xs"
          />
          <span className="text-ink-400" aria-hidden="true">
            –
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max"
            aria-label="Maximum price"
            className="input px-2.5 py-1.5 text-xs"
          />
          <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
            Go
          </button>
        </form>
      </fieldset>

      {/* Brands */}
      {meta?.brands?.length > 0 && (
        <fieldset className="border-t border-ink-200 pt-5">
          <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">
            Brand
          </legend>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {meta.brands.map((brand) => (
              <label
                key={brand}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-700 transition-colors hover:bg-ink-100"
              >
                <input
                  type="radio"
                  name="brand"
                  checked={filters.brand === brand}
                  onChange={() => onChange({ brand })}
                  className="h-3.5 w-3.5 accent-ink-900"
                />
                {brand}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Availability */}
      <fieldset className="border-t border-ink-200 pt-5">
        <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">
          Availability
        </legend>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(filters.inStock)}
            onChange={(e) => onChange({ inStock: e.target.checked || undefined })}
            className="h-4 w-4 rounded accent-ink-900"
          />
          In stock only
        </label>
      </fieldset>
    </aside>
  );
}

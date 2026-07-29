import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { productService } from '../api/products';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';
import { EmptyState, ErrorState, Pagination } from '../components/ui';
import { classNames } from '../utils/format';

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name_asc', label: 'Name: A–Z' },
];

/**
 * Filters live in the URL, not in component state.
 *
 * That means a filtered view is shareable, survives a refresh, and the browser
 * back button steps through filter changes the way users expect.
 */
function parseFilters(searchParams) {
  const get = (key) => searchParams.get(key) || undefined;
  const num = (key) => {
    const raw = searchParams.get(key);
    return raw === null || raw === '' ? undefined : Number(raw);
  };

  return {
    category: get('category'),
    search: get('search'),
    brand: get('brand'),
    minPrice: num('minPrice'),
    maxPrice: num('maxPrice'),
    inStock: searchParams.get('inStock') === 'true' || undefined,
    sort: get('sort') || 'newest',
    offset: num('offset') || 0,
  };
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0 });
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Bumped by the retry button. Without it, retrying an unchanged URL would
  // leave `filters` referentially equal and the effect would never re-run.
  const [reloadKey, setReloadKey] = useState(0);

  // Filter metadata (categories, brands, price range) changes rarely — fetch once.
  useEffect(() => {
    productService
      .filterMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await productService.list({ ...filters, limit: PAGE_SIZE });
        if (cancelled) return;
        setProducts(data.products);
        setPagination(data.pagination);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  /** Merge a patch into the query string. Any filter change resets to page 1. */
  const updateFilters = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);

      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined || value === '' || value === false) next.delete(key);
        else next.set(key, String(value));
      });

      if (!('offset' in patch)) next.delete('offset');

      setSearchParams(next, { replace: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [searchParams, setSearchParams]
  );

  const resetFilters = useCallback(() => {
    const next = new URLSearchParams();
    // Keep the search term — clearing filters shouldn't discard the query.
    if (filters.search) next.set('search', filters.search);
    setSearchParams(next);
  }, [filters.search, setSearchParams]);

  const showHero = !filters.search && !filters.category && pagination.offset === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {showHero && (
        <section className="mb-10 overflow-hidden rounded-2xl bg-ink-900 px-6 py-12 sm:px-12 sm:py-16">
          <div className="max-w-xl">
            <span className="badge bg-white/10 text-brand-300">New season</span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Considered goods,
              <br />
              fairly priced.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-300">
              A tightly edited range of electronics, apparel and homeware — chosen
              because they last, not because they're new.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/?category=electronics" className="btn-accent">
                Shop electronics
              </Link>
              <Link to="/?sort=rating" className="btn bg-white/10 text-white hover:bg-white/20">
                Top rated
              </Link>
            </div>
          </div>
        </section>
      )}

      {filters.search && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            Results for “{filters.search}”
          </h1>
          <button
            type="button"
            onClick={() => updateFilters({ search: undefined })}
            className="mt-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Clear search
          </button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
        {/* Desktop filters */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <FilterSidebar
              meta={meta}
              filters={filters}
              onChange={updateFilters}
              onReset={resetFilters}
              resultCount={pagination.total}
            />
          </div>
        </div>

        <div className="min-w-0">
          {/* Toolbar */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="btn-secondary lg:hidden"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M3 5h14M6 10h8M8.5 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Filters
            </button>

            <p className="hidden text-sm text-ink-500 lg:block">
              {loading ? 'Loading…' : `${pagination.total} product${pagination.total === 1 ? '' : 's'}`}
            </p>

            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="hidden text-sm text-ink-500 sm:block">
                Sort by
              </label>
              <select
                id="sort"
                value={filters.sort}
                onChange={(e) => updateFilters({ sort: e.target.value })}
                className="input w-auto py-2 pr-8 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          {error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : loading ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No products match those filters"
              description="Try widening your price range, or clearing a filter or two."
              action={
                <button type="button" onClick={resetFilters} className="btn-primary">
                  Clear all filters
                </button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              <div className="mt-10">
                <Pagination
                  total={pagination.total}
                  limit={pagination.limit}
                  offset={pagination.offset}
                  onChange={(offset) => updateFilters({ offset })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
            className={classNames(
              'absolute inset-y-0 left-0 w-80 max-w-[85%] overflow-y-auto bg-white p-6 shadow-lift'
            )}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink-900">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
                className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
              >
                ✕
              </button>
            </div>

            <FilterSidebar
              meta={meta}
              filters={filters}
              onChange={(patch) => {
                updateFilters(patch);
                setMobileFiltersOpen(false);
              }}
              onReset={() => {
                resetFilters();
                setMobileFiltersOpen(false);
              }}
              resultCount={pagination.total}
            />
          </div>
        </div>
      )}
    </div>
  );
}

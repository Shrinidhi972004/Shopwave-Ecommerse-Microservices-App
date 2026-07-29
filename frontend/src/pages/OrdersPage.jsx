import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orderService } from '../api/orders';
import { EmptyState, ErrorState, PageLoader, Pagination, StatusBadge } from '../components/ui';
import {
  formatPrice,
  formatDate,
  ORDER_STATUS_STYLES,
  ORDER_STATUS_LABELS,
  classNames,
} from '../utils/format';

const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0 });
  const [status, setStatus] = useState(undefined);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // See HomePage: lets the retry button re-run the effect when nothing
  // else in the dependency list has changed.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await orderService.listMine({ status, limit: PAGE_SIZE, offset });
        if (cancelled) return;
        setOrders(data.orders);
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
  }, [status, offset, reloadKey]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Order history
      </h1>

      {/* Status filter */}
      <div className="mt-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => {
              setStatus(filter.value);
              setOffset(0);
            }}
            className={classNames(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              status === filter.value
                ? 'bg-ink-900 text-white'
                : 'border border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {loading ? (
          <PageLoader label="Loading your orders" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="📦"
            title={status ? `No ${status} orders` : 'No orders yet'}
            description={
              status
                ? 'Try a different status filter.'
                : "When you place your first order, it'll appear here."
            }
            action={
              !status && (
                <Link to="/" className="btn-primary">
                  Start shopping
                </Link>
              )
            }
          />
        ) : (
          <>
            <ul className="space-y-4">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/orders/${order.id}`}
                    className="block rounded-xl border border-ink-200 bg-white p-5 shadow-card transition-shadow hover:shadow-lift"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="font-mono text-sm font-bold text-ink-900">
                            {order.orderNumber}
                          </p>
                          <StatusBadge
                            status={order.status}
                            styles={ORDER_STATUS_STYLES}
                            labels={ORDER_STATUS_LABELS}
                          />
                        </div>
                        <p className="mt-1 text-xs text-ink-500">
                          Placed {formatDate(order.placedAt)} ·{' '}
                          {order.items.length} item{order.items.length === 1 ? '' : 's'}
                        </p>
                      </div>

                      <p className="text-lg font-extrabold tabular-nums text-ink-900">
                        {formatPrice(order.total)}
                      </p>
                    </div>

                    {/* Thumbnail strip */}
                    <div className="mt-4 flex items-center gap-2">
                      {order.items.slice(0, 5).map((item) => (
                        <img
                          key={item.id}
                          src={item.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg border border-ink-200 object-cover"
                        />
                      ))}
                      {order.items.length > 5 && (
                        <span className="text-xs font-medium text-ink-500">
                          +{order.items.length - 5} more
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Pagination
                total={pagination.total}
                limit={pagination.limit}
                offset={pagination.offset}
                onChange={setOffset}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

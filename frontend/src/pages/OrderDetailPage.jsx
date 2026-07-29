import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { orderService } from '../api/orders';
import { useToast } from '../context/ToastContext';
import { PageLoader, ErrorState, StatusBadge, Spinner } from '../components/ui';
import {
  formatPrice,
  formatDateTime,
  ORDER_STATUS_STYLES,
  ORDER_STATUS_LABELS,
  classNames,
} from '../utils/format';

// The happy path an order walks through. `cancelled` is off this track.
const TIMELINE = ['pending', 'paid', 'processing', 'shipped', 'delivered'];

export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  // Set by the checkout redirect, so we can show a confirmation banner once.
  const justPlaced = location.state?.justPlaced;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await orderService.get(id);
        if (!cancelled) setOrder(found);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCancel() {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return;

    setCancelling(true);
    try {
      setOrder(await orderService.cancel(id));
      toast.success('Order cancelled — any reserved stock has been released');
    } catch (err) {
      toast.error(err.message || 'Could not cancel this order');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <PageLoader label="Loading order" />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState message={error} />
        <Link to="/orders" className="btn-primary mt-6">
          Back to orders
        </Link>
      </div>
    );
  }

  if (!order) return null;

  const isCancelled = order.status === 'cancelled';
  const canCancel = ['pending', 'paid', 'processing'].includes(order.status);
  const currentStep = TIMELINE.indexOf(order.status);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {justPlaced && (
        <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <span aria-hidden="true">✓</span> Thank you — your order is confirmed
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            A confirmation would normally be emailed to {order.shippingAddress.email}.
          </p>
        </div>
      )}

      <Link to="/orders" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← All orders
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-extrabold tracking-tight text-ink-900">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-ink-500">Placed {formatDateTime(order.placedAt)}</p>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge
            status={order.status}
            styles={ORDER_STATUS_STYLES}
            labels={ORDER_STATUS_LABELS}
          />
          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="btn-danger py-2 text-xs"
            >
              {cancelling && <Spinner className="h-3 w-3" />}
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
        </div>
      </div>

      {/* Progress timeline */}
      {!isCancelled && (
        <div className="mt-8 card p-6">
          <ol className="flex items-center">
            {TIMELINE.map((step, index) => {
              const reached = index <= currentStep;
              const isLast = index === TIMELINE.length - 1;

              return (
                <li
                  key={step}
                  className={classNames('flex items-center', !isLast && 'flex-1')}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={classNames(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                        reached ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-400'
                      )}
                      aria-current={index === currentStep ? 'step' : undefined}
                    >
                      {reached ? '✓' : index + 1}
                    </span>
                    <span
                      className={classNames(
                        'hidden text-xs font-medium sm:block',
                        reached ? 'text-ink-900' : 'text-ink-400'
                      )}
                    >
                      {ORDER_STATUS_LABELS[step]}
                    </span>
                  </div>

                  {!isLast && (
                    <div
                      className={classNames(
                        'mx-2 h-0.5 flex-1 rounded transition-colors',
                        index < currentStep ? 'bg-ink-900' : 'bg-ink-200'
                      )}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {isCancelled && (
        <div className="mt-8 rounded-xl border border-ink-200 bg-ink-100 px-5 py-4">
          <p className="text-sm font-semibold text-ink-700">This order was cancelled</p>
          <p className="mt-1 text-sm text-ink-500">
            The reserved stock has been returned to the catalogue.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* Items */}
        <section>
          <h2 className="text-base font-bold text-ink-900">Items</h2>
          <ul className="mt-4 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 p-4">
                <Link to={`/product/${item.productId}`} className="shrink-0">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-20 w-20 rounded-lg border border-ink-200 object-cover"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <Link
                    to={`/product/${item.productId}`}
                    className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatPrice(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <p className="self-center text-sm font-bold tabular-nums text-ink-900">
                  {formatPrice(item.lineTotal)}
                </p>
              </li>
            ))}
          </ul>

          {order.notes && (
            <div className="mt-6 card p-5">
              <h3 className="text-sm font-bold text-ink-900">Delivery notes</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{order.notes}</p>
            </div>
          )}
        </section>

        {/* Totals + address */}
        <aside className="space-y-6">
          <div className="card p-5">
            <h2 className="text-sm font-bold text-ink-900">Payment summary</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatPrice(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Shipping</dt>
                <dd className="font-semibold tabular-nums">
                  {order.shipping === 0 ? (
                    <span className="text-emerald-600">Free</span>
                  ) : (
                    formatPrice(order.shipping)
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Tax</dt>
                <dd className="font-semibold tabular-nums">{formatPrice(order.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-2.5">
                <dt className="font-bold text-ink-900">Total</dt>
                <dd className="font-extrabold tabular-nums text-ink-900">
                  {formatPrice(order.total)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500">
              Paid via{' '}
              <span className="font-semibold text-ink-700">
                {{ cod: 'Cash on delivery', card: 'Card', paypal: 'PayPal' }[order.paymentMethod] ||
                  order.paymentMethod}
              </span>
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-ink-900">Shipping to</h2>
            <address className="mt-3 space-y-0.5 text-sm not-italic leading-relaxed text-ink-600">
              <p className="font-semibold text-ink-900">{order.shippingAddress.fullName}</p>
              <p>{order.shippingAddress.address1}</p>
              {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
              <p>
                {order.shippingAddress.city}
                {order.shippingAddress.state && `, ${order.shippingAddress.state}`}{' '}
                {order.shippingAddress.postalCode}
              </p>
              <p>{order.shippingAddress.country}</p>
              <p className="pt-2 text-xs text-ink-500">{order.shippingAddress.email}</p>
              {order.shippingAddress.phone && (
                <p className="text-xs text-ink-500">{order.shippingAddress.phone}</p>
              )}
            </address>
          </div>
        </aside>
      </div>
    </div>
  );
}

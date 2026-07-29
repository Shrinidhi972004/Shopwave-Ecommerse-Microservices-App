import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, QuantityStepper, PageLoader } from '../components/ui';
import { formatPrice } from '../utils/format';

export default function CartPage() {
  const { items, summary, unavailable, loading, isEmpty, updateItem, removeItem, clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Tracks which line is mid-request so only that row disables, not the page.
  const [busyId, setBusyId] = useState(null);

  async function handleQuantity(productId, quantity) {
    setBusyId(productId);
    try {
      await updateItem(productId, quantity);
    } catch (err) {
      toast.error(err.message || 'Could not update quantity');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(productId, name) {
    setBusyId(productId);
    try {
      await removeItem(productId);
      toast.info(`${name} removed from your bag`);
    } catch (err) {
      toast.error(err.message || 'Could not remove item');
    } finally {
      setBusyId(null);
    }
  }

  function handleCheckout() {
    if (!isAuthenticated) {
      // Send them to login, then straight on to checkout.
      navigate('/login', { state: { from: { pathname: '/checkout' } } });
      return;
    }
    navigate('/checkout');
  }

  if (loading && isEmpty) return <PageLoader label="Loading your bag" />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">Your bag</h1>

      {isEmpty ? (
        <div className="mt-8">
          <EmptyState
            icon="🛒"
            title="Your bag is empty"
            description="Once you add something, it'll show up here."
            action={
              <Link to="/" className="btn-primary">
                Start shopping
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10">
          {/* Line items */}
          <section aria-label="Bag items">
            {unavailable.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  {unavailable.length} item{unavailable.length === 1 ? '' : 's'} no longer available
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  They've been left out of your total and won't be ordered.
                </p>
              </div>
            )}

            <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
              {items.map((item) => {
                const busy = busyId === item.productId;

                return (
                  <li key={item.productId} className="flex gap-4 p-4 sm:p-5">
                    <Link to={`/product/${item.slug || item.productId}`} className="shrink-0">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-24 w-24 rounded-lg border border-ink-200 object-cover sm:h-28 sm:w-28"
                      />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex justify-between gap-4">
                        <div className="min-w-0">
                          {item.brand && (
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                              {item.brand}
                            </p>
                          )}
                          <Link
                            to={`/product/${item.slug || item.productId}`}
                            className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {item.name}
                          </Link>
                          <p className="mt-1 text-sm text-ink-500">
                            {formatPrice(item.unitPrice)} each
                          </p>
                        </div>

                        <p className="shrink-0 text-sm font-bold tabular-nums text-ink-900">
                          {formatPrice(item.lineTotal)}
                        </p>
                      </div>

                      {item.quantityAdjusted && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          Quantity reduced to {item.quantity} — that's all we have left.
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between pt-3">
                        <QuantityStepper
                          value={item.quantity}
                          onChange={(q) => handleQuantity(item.productId, q)}
                          max={Math.min(item.availableStock ?? 99, 99)}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemove(item.productId, item.name)}
                          disabled={busy}
                          className="text-xs font-semibold text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center justify-between">
              <Link to="/" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                ← Continue shopping
              </Link>
              <button
                type="button"
                onClick={() => clearCart().catch((e) => toast.error(e.message))}
                className="text-xs font-semibold text-ink-500 hover:text-red-600"
              >
                Empty bag
              </button>
            </div>
          </section>

          {/* Summary */}
          <aside className="mt-8 lg:sticky lg:top-24 lg:mt-0">
            <div className="card p-6">
              <h2 className="text-base font-bold text-ink-900">Order summary</h2>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">
                    Subtotal ({summary.itemCount} item{summary.itemCount === 1 ? '' : 's'})
                  </dt>
                  <dd className="font-semibold tabular-nums text-ink-900">
                    {formatPrice(summary.subtotal)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Shipping</dt>
                  <dd className="font-semibold tabular-nums text-ink-900">
                    {summary.shipping === 0 ? (
                      <span className="text-emerald-600">Free</span>
                    ) : (
                      formatPrice(summary.shipping)
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Estimated tax</dt>
                  <dd className="font-semibold tabular-nums text-ink-900">
                    {formatPrice(summary.tax)}
                  </dd>
                </div>

                <div className="flex justify-between border-t border-ink-200 pt-3">
                  <dt className="text-base font-bold text-ink-900">Total</dt>
                  <dd className="text-base font-extrabold tabular-nums text-ink-900">
                    {formatPrice(summary.total)}
                  </dd>
                </div>
              </dl>

              {summary.amountToFreeShipping > 0 && (
                <div className="mt-5 rounded-lg bg-brand-50 px-3.5 py-3">
                  <p className="text-xs font-medium text-brand-900">
                    Add {formatPrice(summary.amountToFreeShipping)} more for free shipping
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-200">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (summary.subtotal / summary.freeShippingThreshold) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <button type="button" onClick={handleCheckout} className="btn-accent mt-6 w-full py-3">
                {isAuthenticated ? 'Proceed to checkout' : 'Sign in to check out'}
              </button>

              <p className="mt-3 text-center text-xs text-ink-400">
                Taxes and shipping calculated at checkout
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

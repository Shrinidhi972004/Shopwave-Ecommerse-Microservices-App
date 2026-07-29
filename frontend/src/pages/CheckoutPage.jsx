import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { orderService } from '../api/orders';
import { EmptyState, Spinner } from '../components/ui';
import { formatPrice } from '../utils/format';

const PAYMENT_METHODS = [
  { value: 'cod', label: 'Cash on delivery', hint: 'Pay when it arrives' },
  { value: 'card', label: 'Card', hint: 'Simulated — no real charge' },
  { value: 'paypal', label: 'PayPal', hint: 'Simulated — no real charge' },
];

export default function CheckoutPage() {
  const { items, summary, isEmpty, refresh } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United States',
  });
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    // Clear the error as soon as the user starts fixing the field.
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});

    try {
      const order = await orderService.place({
        shippingAddress: form,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      await refresh();
      toast.success(`Order ${order.orderNumber} placed`);
      navigate(`/orders/${order.id}`, { replace: true, state: { justPlaced: true } });
    } catch (err) {
      // Backend labels nested errors "shippingAddress.city" — strip the prefix
      // so they line up with the flat form field names.
      const mapped = {};
      Object.entries(err.fieldErrors || {}).forEach(([key, message]) => {
        mapped[key.replace(/^shippingAddress\./, '')] = message;
      });
      setFieldErrors(mapped);

      toast.error(err.message || 'Could not place your order');

      if (Object.keys(mapped).length > 0) {
        document.querySelector(`[name="${Object.keys(mapped)[0]}"]`)?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isEmpty) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon="🛒"
          title="Nothing to check out"
          description="Your bag is empty — add something first."
          action={
            <Link to="/" className="btn-primary">
              Browse products
            </Link>
          }
        />
      </div>
    );
  }

  const field = (name, label, options = {}) => (
    <div className={options.className}>
      <label htmlFor={name} className="label">
        {label}
        {options.required !== false && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={options.type || 'text'}
        value={form[name]}
        onChange={update(name)}
        autoComplete={options.autoComplete}
        placeholder={options.placeholder}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
        className={`input ${fieldErrors[name] ? 'input-error' : ''}`}
      />
      {fieldErrors[name] && (
        <p id={`${name}-error`} className="field-error">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">Checkout</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-8 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10"
      >
        <div className="space-y-8">
          {/* Shipping */}
          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">Shipping address</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {field('fullName', 'Full name', { autoComplete: 'name', className: 'sm:col-span-2' })}
              {field('email', 'Email', { type: 'email', autoComplete: 'email' })}
              {field('phone', 'Phone', { type: 'tel', autoComplete: 'tel', required: false })}
              {field('address1', 'Address', {
                autoComplete: 'address-line1',
                className: 'sm:col-span-2',
                placeholder: 'Street address',
              })}
              {field('address2', 'Apartment, suite, etc.', {
                autoComplete: 'address-line2',
                className: 'sm:col-span-2',
                required: false,
              })}
              {field('city', 'City', { autoComplete: 'address-level2' })}
              {field('state', 'State / Province', {
                autoComplete: 'address-level1',
                required: false,
              })}
              {field('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
              {field('country', 'Country', { autoComplete: 'country-name' })}
            </div>
          </section>

          {/* Payment */}
          <section className="card p-6">
            <h2 className="text-base font-bold text-ink-900">Payment method</h2>
            <p className="mt-1 text-xs text-ink-500">
              This is a demo — no payment is processed and no card details are collected.
            </p>

            <div className="mt-5 space-y-2.5">
              {PAYMENT_METHODS.map((method) => (
                <label
                  key={method.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    paymentMethod === method.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.value}
                    checked={paymentMethod === method.value}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink-900">{method.label}</span>
                    <span className="block text-xs text-ink-500">{method.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section className="card p-6">
            <label htmlFor="notes" className="text-base font-bold text-ink-900">
              Delivery notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Gate code, safe place to leave it, anything else we should know…"
              className="input mt-3 resize-none"
            />
            <p className="mt-1.5 text-right text-xs text-ink-400">{notes.length}/500</p>
          </section>
        </div>

        {/* Summary */}
        <aside className="mt-8 lg:sticky lg:top-24 lg:mt-0">
          <div className="card p-6">
            <h2 className="text-base font-bold text-ink-900">Order summary</h2>

            <ul className="mt-5 max-h-72 space-y-4 overflow-y-auto pr-1">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-14 w-14 rounded-lg border border-ink-200 object-cover"
                    />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-900 px-1 text-[11px] font-bold text-white">
                      {item.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-semibold text-ink-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{formatPrice(item.unitPrice)} each</p>
                  </div>
                  <p className="shrink-0 text-xs font-bold tabular-nums text-ink-900">
                    {formatPrice(item.lineTotal)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2.5 border-t border-ink-200 pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatPrice(summary.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Shipping</dt>
                <dd className="font-semibold tabular-nums">
                  {summary.shipping === 0 ? (
                    <span className="text-emerald-600">Free</span>
                  ) : (
                    formatPrice(summary.shipping)
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Tax</dt>
                <dd className="font-semibold tabular-nums">{formatPrice(summary.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-3">
                <dt className="text-base font-bold text-ink-900">Total</dt>
                <dd className="text-base font-extrabold tabular-nums text-ink-900">
                  {formatPrice(summary.total)}
                </dd>
              </div>
            </dl>

            <button type="submit" disabled={submitting} className="btn-accent mt-6 w-full py-3">
              {submitting && <Spinner className="h-4 w-4" />}
              {submitting ? 'Placing order…' : `Place order · ${formatPrice(summary.total)}`}
            </button>

            <p className="mt-3 text-center text-xs text-ink-400">
              By placing this order you agree to our demo terms.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

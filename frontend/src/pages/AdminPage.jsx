import { useState, useEffect, useCallback } from 'react';
import { productService } from '../api/products';
import { orderService } from '../api/orders';
import { useToast } from '../context/ToastContext';
import { PageLoader, ErrorState, StatusBadge, Spinner, EmptyState } from '../components/ui';
import {
  formatPrice,
  formatDate,
  ORDER_STATUS_STYLES,
  ORDER_STATUS_LABELS,
  classNames,
} from '../utils/format';

const EMPTY_PRODUCT = {
  name: '',
  brand: '',
  description: '',
  price: '',
  stock: '',
  imageUrl: '',
  categoryId: '',
};

// Mirrors ALLOWED_TRANSITIONS in order-service/src/controllers/orderController.js.
// Kept in sync manually; the server rejects anything invalid regardless.
const NEXT_STATUSES = {
  pending: ['paid', 'processing', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export default function AdminPage() {
  const [tab, setTab] = useState('products');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Admin dashboard
      </h1>
      <p className="mt-1 text-sm text-ink-500">Manage the catalogue and fulfil orders</p>

      <div className="mt-6 flex gap-1 border-b border-ink-200">
        {[
          { id: 'products', label: 'Products' },
          { id: 'orders', label: 'Orders' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={classNames(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'border-ink-900 text-ink-900'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === 'products' ? <ProductsTab /> : <OrdersTab />}
      </div>
    </div>
  );
}

// ─── Products ───────────────────────────────────────────────────────────────

function ProductsTab() {
  const toast = useToast();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null); // product being edited, or null
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productData, categoryData] = await Promise.all([
        // includeInactive is honoured only for admins by the product service.
        productService.list({ limit: 100, includeInactive: true }),
        productService.categories(),
      ]);
      setProducts(productData.products);
      setCategories(categoryData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setFieldErrors({});
    setShowForm(true);
  }

  function openEdit(product) {
    setEditing(product);
    setForm({
      name: product.name,
      brand: product.brand || '',
      description: product.description || '',
      price: String(product.price),
      stock: String(product.stock),
      imageUrl: product.imageUrl,
      categoryId: product.categoryId ? String(product.categoryId) : '',
    });
    setFieldErrors({});
    setShowForm(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});

    // Empty optional fields must be omitted, not sent as "" — the backend
    // treats "" as absent for optional fields but rejects it for required ones.
    const payload = {
      name: form.name,
      description: form.description,
      imageUrl: form.imageUrl,
      price: Number(form.price),
      stock: Number(form.stock || 0),
      ...(form.brand ? { brand: form.brand } : {}),
      ...(form.categoryId ? { categoryId: Number(form.categoryId) } : {}),
    };

    try {
      if (editing) {
        await productService.update(editing.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await productService.create(payload);
        toast.success(`${payload.name} created`);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setFieldErrors(err.fieldErrors || {});
      toast.error(err.message || 'Could not save the product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product) {
    if (!window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return;

    try {
      await productService.remove(product.id);
      toast.success(`${product.name} deleted`);
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not delete the product');
    }
  }

  if (loading) return <PageLoader label="Loading catalogue" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const inputFor = (name, label, options = {}) => (
    <div className={options.className}>
      <label htmlFor={`p-${name}`} className="label">
        {label}
      </label>
      {options.type === 'textarea' ? (
        <textarea
          id={`p-${name}`}
          rows={3}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          className={`input resize-none ${fieldErrors[name] ? 'input-error' : ''}`}
        />
      ) : options.type === 'select' ? (
        <select
          id={`p-${name}`}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          className={`input ${fieldErrors[name] ? 'input-error' : ''}`}
        >
          <option value="">Uncategorised</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`p-${name}`}
          type={options.type || 'text'}
          step={options.step}
          min={options.min}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          placeholder={options.placeholder}
          className={`input ${fieldErrors[name] ? 'input-error' : ''}`}
        />
      )}
      {fieldErrors[name] && <p className="field-error">{fieldErrors[name]}</p>}
    </div>
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-ink-500">{products.length} products</p>
        <button type="button" onClick={openCreate} className="btn-primary">
          + Add product
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-left">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Product</th>
              <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Category</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">Price</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">Stock</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-ink-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg border border-ink-200 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{product.name}</p>
                      <p className="truncate text-xs text-ink-400">{product.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-600">{product.categoryName || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatPrice(product.price)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={classNames(
                      'badge tabular-nums',
                      product.stock === 0
                        ? 'bg-red-100 text-red-700'
                        : product.stock <= 10
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                    )}
                  >
                    {product.stock}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(product)}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(product)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <div
            className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
            aria-hidden="true"
          />

          <form
            onSubmit={handleSave}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit product' : 'Add product'}
            className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lift sm:p-8"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-ink-900">
                {editing ? 'Edit product' : 'Add product'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {inputFor('name', 'Name', { className: 'sm:col-span-2' })}
              {inputFor('brand', 'Brand')}
              {inputFor('categoryId', 'Category', { type: 'select' })}
              {inputFor('price', 'Price (USD)', { type: 'number', step: '0.01', min: '0' })}
              {inputFor('stock', 'Stock', { type: 'number', min: '0' })}
              {inputFor('imageUrl', 'Image URL', {
                className: 'sm:col-span-2',
                placeholder: 'https://picsum.photos/seed/example/800/800',
              })}
              {inputFor('description', 'Description', {
                type: 'textarea',
                className: 'sm:col-span-2',
              })}
            </div>

            {form.imageUrl && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
                <img
                  src={form.imageUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-ink-200 object-cover"
                  onError={(e) => {
                    e.currentTarget.style.opacity = '0.25';
                  }}
                />
                <p className="text-xs text-ink-500">Image preview</p>
              </div>
            )}

            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Spinner className="h-4 w-4" />}
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ─── Orders ─────────────────────────────────────────────────────────────────

function OrdersTab() {
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderData, statData] = await Promise.all([
        orderService.listAll({ limit: 100 }),
        orderService.stats(),
      ]);
      setOrders(orderData.orders);
      setStats(statData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(order, status) {
    setUpdatingId(order.id);
    try {
      const updated = await orderService.updateStatus(order.id, status);
      setOrders((current) => current.map((o) => (o.id === order.id ? updated : o)));
      toast.success(`${order.orderNumber} → ${ORDER_STATUS_LABELS[status]}`);
    } catch (err) {
      toast.error(err.message || 'Could not update the order');
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <PageLoader label="Loading orders" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total orders', value: stats.totalOrders },
            { label: 'Revenue', value: formatPrice(stats.revenue) },
            { label: 'Pending', value: stats.byStatus.pending },
            { label: 'Delivered', value: stats.byStatus.delivered },
          ].map((stat) => (
            <div key={stat.label} className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink-900">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState icon="📦" title="No orders yet" description="Orders will appear here once customers check out." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Order</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Date</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">Total</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Advance to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {orders.map((order) => {
                const nextOptions = NEXT_STATUSES[order.status] || [];

                return (
                  <tr key={order.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-ink-900">{order.orderNumber}</p>
                      <p className="text-xs text-ink-400">
                        {order.items.length} item{order.items.length === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{order.shippingAddress.fullName}</p>
                      <p className="truncate text-xs text-ink-400">{order.shippingAddress.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{formatDate(order.placedAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatPrice(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={order.status}
                        styles={ORDER_STATUS_STYLES}
                        labels={ORDER_STATUS_LABELS}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {nextOptions.length === 0 ? (
                        <span className="text-xs text-ink-400">Final</span>
                      ) : (
                        <select
                          value=""
                          disabled={updatingId === order.id}
                          onChange={(e) => e.target.value && handleStatusChange(order, e.target.value)}
                          aria-label={`Change status for ${order.orderNumber}`}
                          className="input w-auto py-1.5 text-xs"
                        >
                          <option value="">Choose…</option>
                          {nextOptions.map((status) => (
                            <option key={status} value={status}>
                              {ORDER_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

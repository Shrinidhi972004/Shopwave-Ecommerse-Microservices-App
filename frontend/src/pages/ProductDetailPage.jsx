import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { productService } from '../api/products';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import ProductCard from '../components/ProductCard';
import { Rating, PageLoader, ErrorState, QuantityStepper, Spinner } from '../components/ui';
import { formatPrice } from '../utils/format';

export default function ProductDetailPage() {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const toast = useToast();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setQuantity(1);
      window.scrollTo({ top: 0 });

      try {
        const found = await productService.get(idOrSlug);
        if (cancelled) return;
        setProduct(found);

        // Same-category products, minus the one being viewed.
        if (found.categorySlug) {
          const data = await productService.list({
            category: found.categorySlug,
            limit: 5,
          });
          if (!cancelled) {
            setRelated(data.products.filter((p) => p.id !== found.id).slice(0, 4));
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  async function handleAdd(buyNow = false) {
    setAdding(true);
    try {
      await addItem(product, quantity);
      if (buyNow) navigate('/cart');
      else toast.success(`${quantity} × ${product.name} added to your bag`);
    } catch (err) {
      toast.error(err.message || 'Could not add to bag');
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <PageLoader label="Loading product" />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState message={error} />
        <Link to="/" className="btn-primary mt-6">
          Back to shop
        </Link>
      </div>
    );
  }

  if (!product) return null;

  const maxQuantity = Math.min(product.stock, 99);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-ink-500">
        <Link to="/" className="hover:text-ink-900">
          Shop
        </Link>
        {product.categorySlug && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/?category=${product.categorySlug}`} className="hover:text-ink-900">
              {product.categoryName}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-ink-900">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Image */}
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="aspect-square w-full object-cover"
          />
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {product.brand && (
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
              {product.brand}
            </p>
          )}

          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-ink-900">
            {product.name}
          </h1>

          {product.rating > 0 && (
            <div className="mt-3">
              <Rating value={product.rating} count={product.reviewCount} size="lg" />
            </div>
          )}

          <p className="mt-5 text-3xl font-bold tracking-tight text-ink-900">
            {formatPrice(product.price)}
          </p>

          <div className="mt-2 flex items-center gap-2 text-sm">
            {product.inStock ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="font-medium text-emerald-700">In stock</span>
                {product.stock <= 10 && (
                  <span className="text-ink-500">— only {product.stock} left</span>
                )}
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                <span className="font-medium text-red-700">Out of stock</span>
              </>
            )}
          </div>

          <p className="mt-6 leading-relaxed text-ink-600">{product.description}</p>

          {/* Actions */}
          <div className="mt-8 border-t border-ink-200 pt-8">
            {product.inStock ? (
              <>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-ink-700">Quantity</span>
                  <QuantityStepper
                    value={quantity}
                    onChange={setQuantity}
                    max={maxQuantity}
                    disabled={adding}
                  />
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => handleAdd(false)}
                    disabled={adding}
                    className="btn-primary flex-1 py-3"
                  >
                    {adding && <Spinner className="h-4 w-4" />}
                    {adding ? 'Adding…' : 'Add to bag'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdd(true)}
                    disabled={adding}
                    className="btn-accent flex-1 py-3"
                  >
                    Buy now
                  </button>
                </div>
              </>
            ) : (
              <button type="button" disabled className="btn-primary w-full py-3">
                Out of stock
              </button>
            )}
          </div>

          {/* Trust signals */}
          <dl className="mt-8 grid gap-4 border-t border-ink-200 pt-8 sm:grid-cols-3">
            {[
              { icon: '🚚', term: 'Free shipping', desc: 'On orders over $75' },
              { icon: '↩️', term: '30-day returns', desc: 'No questions asked' },
              { icon: '🔒', term: 'Secure checkout', desc: 'Encrypted end to end' },
            ].map((item) => (
              <div key={item.term}>
                <dt className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.term}
                </dt>
                <dd className="mt-0.5 text-xs text-ink-500">{item.desc}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-xs text-ink-400">SKU: {product.sku}</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-ink-900">
            More in {product.categoryName}
          </h2>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

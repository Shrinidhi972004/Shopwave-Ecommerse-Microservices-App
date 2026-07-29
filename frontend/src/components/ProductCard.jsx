import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice, classNames } from '../utils/format';
import { Rating, Spinner } from './ui';

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const outOfStock = !product.inStock;
  const lowStock = product.inStock && product.stock <= 10;

  async function handleAdd(event) {
    // The whole card is a link; stop the click from navigating.
    event.preventDefault();
    event.stopPropagation();

    setAdding(true);
    try {
      await addItem(product, 1);
      toast.success(`${product.name} added to your bag`);
    } catch (err) {
      toast.error(err.message || 'Could not add to bag');
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card transition-shadow duration-200 hover:shadow-lift">
      <Link
        to={`/product/${product.slug || product.id}`}
        className="flex flex-1 flex-col focus-visible:outline-none"
      >
        <div className="relative aspect-square overflow-hidden bg-ink-100">
          {!imageLoaded && <div className="absolute inset-0 skeleton rounded-none" />}
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              setImageLoaded(true);
              e.currentTarget.src =
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23e2e8f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="%2394a3b8" text-anchor="middle">No image</text></svg>';
            }}
            className={classNames(
              'h-full w-full object-cover transition-all duration-500 group-hover:scale-105',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
          />

          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <span className="badge bg-ink-900 text-white">Sold out</span>
            </div>
          )}
          {lowStock && (
            <span className="badge absolute left-3 top-3 bg-amber-100 text-amber-800">
              Only {product.stock} left
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {product.brand && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {product.brand}
            </p>
          )}

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
            {product.name}
          </h3>

          {product.rating > 0 && <Rating value={product.rating} count={product.reviewCount} />}

          <p className="mt-auto pt-2 text-lg font-bold tracking-tight text-ink-900">
            {formatPrice(product.price)}
          </p>
        </div>
      </Link>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={handleAdd}
          disabled={outOfStock || adding}
          className="btn-primary w-full"
        >
          {adding ? <Spinner className="h-4 w-4" /> : null}
          {outOfStock ? 'Sold out' : adding ? 'Adding…' : 'Add to bag'}
        </button>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200/80 bg-white">
      <div className="aspect-square skeleton rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-2.5 w-1/3" />
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-2/3" />
        <div className="skeleton h-5 w-1/3" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  );
}

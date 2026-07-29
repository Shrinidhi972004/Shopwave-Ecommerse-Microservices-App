import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900">
                <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
                  <path d="M5 20c3-4 5.5-4 8.5 0s5.5 4 8.5 0 5.5-4 5-4" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="16" cy="11" r="2.5" fill="#38bdf8" />
                </svg>
              </span>
              <span className="text-lg font-extrabold tracking-tight text-ink-900">ShopWave</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
              Considered goods, fairly priced. A reference storefront built on a
              three-tier microservice architecture.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900">Shop</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-500">
              <li><Link to="/" className="hover:text-ink-900">All products</Link></li>
              <li><Link to="/?category=electronics" className="hover:text-ink-900">Electronics</Link></li>
              <li><Link to="/?category=apparel" className="hover:text-ink-900">Apparel</Link></li>
              <li><Link to="/?category=home-living" className="hover:text-ink-900">Home &amp; Living</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900">Account</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-500">
              <li><Link to="/login" className="hover:text-ink-900">Sign in</Link></li>
              <li><Link to="/register" className="hover:text-ink-900">Create account</Link></li>
              <li><Link to="/orders" className="hover:text-ink-900">Order history</Link></li>
              <li><Link to="/cart" className="hover:text-ink-900">Your bag</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-ink-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-400">
            © {new Date().getFullYear()} ShopWave. Demo application — not a real store.
          </p>
          <p className="text-xs text-ink-400">Free shipping on orders over $75</p>
        </div>
      </div>
    </footer>
  );
}

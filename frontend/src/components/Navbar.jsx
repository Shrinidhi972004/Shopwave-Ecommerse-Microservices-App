import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { classNames } from '../utils/format';

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('search') || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account dropdown on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKeyDown = (e) => e.key === 'Escape' && setMenuOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Keep the input in sync when the URL changes from elsewhere (e.g. back button).
  useEffect(() => {
    setQuery(searchParams.get('search') || '');
  }, [searchParams]);

  function handleSearch(event) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/?search=${encodeURIComponent(trimmed)}` : '/');
    setMobileOpen(false);
  }

  function handleLogout() {
    logout();
    setMenuOpen(false);
    navigate('/');
  }

  const navLinkClass = ({ isActive }) =>
    classNames(
      'text-sm font-medium transition-colors',
      isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900'
    );

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900">
              <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M5 20c3-4 5.5-4 8.5 0s5.5 4 8.5 0 5.5-4 5-4"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="11" r="2.5" fill="#38bdf8" />
              </svg>
            </span>
            <span className="text-lg font-extrabold tracking-tight text-ink-900">ShopWave</span>
          </Link>

          {/* Desktop search */}
          <form onSubmit={handleSearch} className="hidden flex-1 md:block" role="search">
            <div className="relative mx-auto max-w-lg">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, brands…"
                aria-label="Search products"
                className="input pl-10"
              />
            </div>
          </form>

          {/* Desktop nav */}
          <nav className="ml-auto hidden items-center gap-6 md:flex">
            <NavLink to="/" end className={navLinkClass}>
              Shop
            </NavLink>
            {isAuthenticated && (
              <NavLink to="/orders" className={navLinkClass}>
                Orders
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {/* Cart */}
            <Link
              to="/cart"
              className="relative rounded-lg p-2.5 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
              aria-label={`Shopping bag, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z" strokeLinejoin="round" />
                <path d="M3 6h18M16 10a4 4 0 01-8 0" strokeLinecap="round" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Link>

            {/* Account */}
            {isAuthenticated ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-ink-100"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">
                    {user.fullName.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden text-sm font-medium text-ink-700 lg:block">
                    {user.fullName.split(' ')[0]}
                  </span>
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lift"
                  >
                    <div className="border-b border-ink-100 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-ink-900">{user.fullName}</p>
                      <p className="truncate text-xs text-ink-500">{user.email}</p>
                      {isAdmin && (
                        <span className="badge mt-2 bg-brand-100 text-brand-800">Admin</span>
                      )}
                    </div>
                    <Link
                      to="/orders"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                    >
                      Order history
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                      >
                        Admin dashboard
                      </Link>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="w-full border-t border-ink-100 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/login" className="btn-ghost">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary">
                  Sign up
                </Link>
              </div>
            )}

            {/* Mobile toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation menu"
              className="rounded-lg p-2.5 text-ink-600 transition-colors hover:bg-ink-100 md:hidden"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {mobileOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        {mobileOpen && (
          <div className="border-t border-ink-200 py-4 md:hidden">
            <form onSubmit={handleSearch} className="mb-4" role="search">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products"
                className="input"
              />
            </form>

            <nav className="flex flex-col gap-1">
              <NavLink to="/" end onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                Shop
              </NavLink>
              {isAuthenticated && (
                <NavLink to="/orders" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Order history
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Admin dashboard
                </NavLink>
              )}
              {!isAuthenticated && (
                <div className="mt-3 flex gap-2">
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-secondary flex-1">
                    Sign in
                  </Link>
                  <Link to="/register" onClick={() => setMobileOpen(false)} className="btn-primary flex-1">
                    Sign up
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cartService } from '../api/cart';
import { productService } from '../api/products';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

const GUEST_KEY = 'shopwave.guestCart';
const EMPTY_SUMMARY = {
  itemCount: 0,
  lineCount: 0,
  subtotal: 0,
  shipping: 0,
  tax: 0,
  total: 0,
  freeShippingThreshold: 75,
  amountToFreeShipping: 75,
};

/** Guest carts live in localStorage as [{ productId, quantity }]. */
function readGuestCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeGuestCart(items) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(items));
}

/**
 * Recomputes the same totals the cart service would, for guests who have no
 * server-side cart. The rules are duplicated here on purpose: a guest gets an
 * instant, offline-capable estimate, and the server recalculates from scratch
 * at checkout so this copy can never be authoritative.
 */
function computeGuestSummary(items) {
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
  const shipping = subtotal === 0 || subtotal >= 75 ? 0 : 7.95;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  return {
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    lineCount: items.length,
    subtotal,
    shipping,
    tax,
    total: Math.round((subtotal + shipping + tax) * 100) / 100,
    freeShippingThreshold: 75,
    amountToFreeShipping: subtotal >= 75 ? 0 : Math.round((75 - subtotal) * 100) / 100,
  };
}

export function CartProvider({ children }) {
  const { isAuthenticated, initialising } = useAuth();

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [unavailable, setUnavailable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Guards the login->merge transition so a re-render can't fire it twice.
  const mergedRef = useRef(false);

  const applyServerCart = useCallback((data) => {
    setItems(data.items || []);
    setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
    setUnavailable(data.unavailable || []);
  }, []);

  /** Hydrate a guest cart by resolving product details for stored ids. */
  const loadGuestCart = useCallback(async () => {
    const stored = readGuestCart();
    if (stored.length === 0) {
      setItems([]);
      setSummary(EMPTY_SUMMARY);
      setUnavailable([]);
      return;
    }

    setLoading(true);
    try {
      const resolved = await Promise.all(
        stored.map(async (entry) => {
          try {
            const product = await productService.get(entry.productId);
            const quantity = Math.min(entry.quantity, product.stock);
            if (!product.isActive || quantity < 1) return null;
            return {
              id: product.id,
              productId: product.id,
              name: product.name,
              slug: product.slug,
              brand: product.brand,
              imageUrl: product.imageUrl,
              unitPrice: product.price,
              quantity,
              availableStock: product.stock,
              lineTotal: Math.round(product.price * quantity * 100) / 100,
            };
          } catch {
            // Product vanished — drop it silently rather than breaking the cart.
            return null;
          }
        })
      );

      const live = resolved.filter(Boolean);
      setItems(live);
      setSummary(computeGuestSummary(live));
      setUnavailable([]);
      // Prune anything that no longer resolves, so it isn't re-fetched forever.
      writeGuestCart(live.map((i) => ({ productId: i.productId, quantity: i.quantity })));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return loadGuestCart();
    setLoading(true);
    setError(null);
    try {
      applyServerCart(await cartService.get());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadGuestCart, applyServerCart]);

  // On login, push the guest cart to the server, then adopt the merged result.
  useEffect(() => {
    if (initialising) return;

    if (!isAuthenticated) {
      mergedRef.current = false;
      loadGuestCart();
      return;
    }

    if (mergedRef.current) return;
    mergedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const guest = readGuestCart();
        const data = guest.length > 0 ? await cartService.merge(guest) : await cartService.get();
        localStorage.removeItem(GUEST_KEY);
        applyServerCart(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, initialising, loadGuestCart, applyServerCart]);

  const addItem = useCallback(
    async (product, quantity = 1) => {
      if (isAuthenticated) {
        applyServerCart(await cartService.addItem(product.id, quantity));
        return;
      }
      const stored = readGuestCart();
      const existing = stored.find((i) => i.productId === product.id);
      const target = Math.min((existing?.quantity || 0) + quantity, product.stock);

      if (existing) existing.quantity = target;
      else stored.push({ productId: product.id, quantity: target });

      writeGuestCart(stored);
      await loadGuestCart();
    },
    [isAuthenticated, applyServerCart, loadGuestCart]
  );

  const updateItem = useCallback(
    async (productId, quantity) => {
      if (isAuthenticated) {
        applyServerCart(await cartService.updateItem(productId, quantity));
        return;
      }
      const stored = readGuestCart().map((i) =>
        i.productId === productId ? { ...i, quantity } : i
      );
      writeGuestCart(stored);
      await loadGuestCart();
    },
    [isAuthenticated, applyServerCart, loadGuestCart]
  );

  const removeItem = useCallback(
    async (productId) => {
      if (isAuthenticated) {
        applyServerCart(await cartService.removeItem(productId));
        return;
      }
      writeGuestCart(readGuestCart().filter((i) => i.productId !== productId));
      await loadGuestCart();
    },
    [isAuthenticated, applyServerCart, loadGuestCart]
  );

  const clearCart = useCallback(async () => {
    if (isAuthenticated) await cartService.clear();
    else writeGuestCart([]);
    setItems([]);
    setSummary(EMPTY_SUMMARY);
    setUnavailable([]);
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      items,
      summary,
      unavailable,
      loading,
      error,
      itemCount: summary.itemCount,
      isEmpty: items.length === 0,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      refresh,
    }),
    [items, summary, unavailable, loading, error, addItem, updateItem, removeItem, clearCart, refresh]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

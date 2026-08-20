// =====================================================
// Global app store (vanilla JS state management)
// =====================================================
// Lightweight reactive store with localStorage persistence.
// Similar API to Zustand but framework-agnostic.
// =====================================================

const STORAGE_KEY = "almacen-pos-state-v1";

const DEFAULT_STATE = {
  // Auth
  currentUser: null,
  authMode: null, // 'user' | 'pin' | null

  // Current warehouse
  currentWarehouse: null,

  // Settings
  settings: {
    pinCode: "2025",
    elToqueEnabled: true,
    elToqueMarkup: 5,
    businessName: "MANNOL",
    lastRateSync: null,
  },

  // Rates (cached)
  rates: {},

  // Catalogs (cached locally)
  managers: [],
  cards: [],
  categories: [],

  // Cart (POS)
  cart: [],
  cartWarehouseId: null, // almacén para el que se está vendiendo

  // Payments during checkout
  payments: [],

  // Offline queue
  offlineQueue: [],

  // UI
  theme: "system",
};

class Store {
  constructor() {
    this.state = { ...DEFAULT_STATE };
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = { ...DEFAULT_STATE, ...parsed };
        // Don't persist cart/payments across sessions
        this.state.cart = [];
        this.state.payments = [];
      }
    } catch (err) {
      console.warn("Store load failed:", err);
    }
  }

  save() {
    try {
      // Persist only stable parts
      const toSave = {
        currentUser: this.state.currentUser,
        authMode: this.state.authMode,
        currentWarehouse: this.state.currentWarehouse,
        settings: this.state.settings,
        rates: this.state.rates,
        offlineQueue: this.state.offlineQueue,
        theme: this.state.theme,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.warn("Store save failed:", err);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((l) => l(this.state));
    this.save();
  }

  setState(updater) {
    const newState = typeof updater === "function" ? updater(this.state) : updater;
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  getState() {
    return this.state;
  }

  // Convenience methods
  setUser(user) {
    this.setState({ currentUser: user });
  }

  setAuthMode(mode) {
    this.setState({ authMode: mode });
  }

  logout() {
    this.setState({
      currentUser: null,
      authMode: null,
      cart: [],
      payments: [],
    });
  }

  setWarehouse(w) {
    this.setState({ currentWarehouse: w });
  }

  setSettings(s) {
    this.setState((st) => ({ settings: { ...st.settings, ...s } }));
  }

  setRates(rates) {
    const map = {};
    rates.forEach((r) => (map[r.currency] = r));
    this.setState({ rates: map });
  }

  // Cart operations
  addToCart(product, qty = 1) {
    const unitPrice = product.salePrice || product.priceUSD || 0;
    this.setState((st) => {
      const existing = st.cart.find((i) => i.productId === product.id);
      let cart;
      if (existing) {
        cart = st.cart.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + qty, subtotalUSD: (i.quantity + qty) * (i.unitPrice || i.priceUSD || 0) }
            : i
        );
      } else {
        cart = [
          ...st.cart,
          {
            productId: product.id,
            name: product.name,
            unitPrice,
            priceUSD: unitPrice, // backwards compat
            quantity: qty,
            subtotalUSD: unitPrice * qty,
          },
        ];
      }
      return { cart };
    });
  }

  removeFromCart(productId) {
    this.setState((st) => ({ cart: st.cart.filter((i) => i.productId !== productId) }));
  }

  updateCartQty(productId, qty) {
    this.setState((st) => ({
      cart: st.cart.map((i) =>
        i.productId === productId ? { ...i, quantity: qty, subtotalUSD: qty * (i.unitPrice || i.priceUSD || 0) } : i
      ),
    }));
  }

  clearCart() {
    this.setState({ cart: [] });
  }

  cartTotal() {
    return this.state.cart.reduce((s, i) => s + i.subtotalUSD, 0);
  }

  // Payments
  addPayment(p) {
    this.setState((st) => ({ payments: [...st.payments, p] }));
  }

  removePayment(idx) {
    this.setState((st) => ({ payments: st.payments.filter((_, i) => i !== idx) }));
  }

  clearPayments() {
    this.setState({ payments: [] });
  }

  paymentsTotal() {
    return this.state.payments.reduce((s, p) => s + p.amountUSD, 0);
  }

  // Offline queue
  enqueueOfflineSale(sale) {
    this.setState((st) => ({ offlineQueue: [...st.offlineQueue, sale] }));
  }

  dequeueOfflineSale(id) {
    this.setState((st) => ({ offlineQueue: st.offlineQueue.filter((s) => s.id !== id) }));
  }

  // Theme
  setTheme(theme) {
    this.setState({ theme });
    applyTheme(theme);
  }
}

// Apply theme to document
export function applyTheme(theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#0f172a" : "#ffffff");
}

// Listen for system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const store = getStore();
  if (store.getState().theme === "system") applyTheme("system");
});

// Singleton
let storeInstance = null;
export function getStore() {
  if (!storeInstance) storeInstance = new Store();
  return storeInstance;
}

// Convenience hook for components
export function useStore(selector) {
  const store = getStore();
  const getValue = () => (selector ? selector(store.getState()) : store.getState());
  return {
    get: getValue,
    subscribe: (cb) => store.subscribe(() => cb(getValue())),
  };
}

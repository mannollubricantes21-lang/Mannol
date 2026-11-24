// =====================================================
// Global app store (vanilla JS state management)
// =====================================================
// Lightweight reactive store with localStorage persistence.
// Similar API to Zustand but framework-agnostic.
// =====================================================

import { importLegacyQueue, addToQueue, removeFromQueue, readQueue, subscribeQueue } from "./offline-queue.js";

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

  // Offline queue — v5.13.0: la cola vive en js/offline-queue.js (clave propia).
  // Se mantiene este campo (solo lectura, copia) por compatibilidad.
  offlineQueue: [],

  // UI
  theme: "system",
};

class Store {
  constructor() {
    this.state = { ...DEFAULT_STATE };
    this.listeners = new Set();
    this.load();
    // Copia de compatibilidad de la cola (sin re-render ni re-guardado)
    try { subscribeQueue((q) => { this.state.offlineQueue = q; }); } catch {}
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // v5.13.0: mover la cola de versiones anteriores a su clave propia
        // ANTES de que cualquier save() reescriba este estado.
        if (Array.isArray(parsed.offlineQueue) && parsed.offlineQueue.length > 0) {
          try {
            const n = importLegacyQueue(parsed.offlineQueue);
            if (n > 0) console.info(`[Store] ${n} venta(s) pendiente(s) movidas a la cola nueva`);
            delete parsed.offlineQueue;
          } catch (err) {
            // Si no se pudo migrar (sin espacio), NO tocar el estado guardado
            console.warn("[Store] No se pudo migrar la cola offline:", err);
            this._legacyQueue = parsed.offlineQueue;
          }
        }
        this.state = { ...DEFAULT_STATE, ...parsed };
        // Don't persist cart/payments across sessions
        this.state.cart = [];
        this.state.payments = [];
      }
      this.state.offlineQueue = readQueue();
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
        theme: this.state.theme,
      };
      // Solo si la migración falló: conservar la cola vieja tal cual estaba
      if (this._legacyQueue) toSave.offlineQueue = this._legacyQueue;
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

  // Offline queue (compatibilidad) — v5.13.0 delega en js/offline-queue.js.
  // Ya no se descartan ventas antiguas al llegar a un tope.
  enqueueOfflineSale(sale) {
    addToQueue(sale);
    this.setState({ offlineQueue: readQueue() });
  }

  dequeueOfflineSale(id) {
    removeFromQueue(id);
    this.setState({ offlineQueue: readQueue() });
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
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.setAttribute("data-theme", isDark ? "dark" : "light");
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#0f172a" : "#ffffff");
}

// Listen for system theme changes (guard: matchMedia no existe en entornos
// sin navegador completo — p.ej. tests con jsdom — y rompería el import)
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const store = getStore();
    if (store.getState().theme === "system") applyTheme("system");
  });
}

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

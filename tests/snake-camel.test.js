// =====================================================
// Tests: Store (enqueueOfflineSale cap, cart, payments)
// =====================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const storage = {
  data: {},
  getItem: vi.fn((k) => storage.data[k] ?? null),
  setItem: vi.fn((k, v) => { storage.data[k] = String(v); }),
  removeItem: vi.fn((k) => { delete storage.data[k]; }),
  clear: vi.fn(() => { storage.data = {}; }),
};
global.localStorage = storage;

describe("store.js — offline queue cap", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("cap de 500 ventas en la cola offline", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();

    // Encolar 550 ventas
    for (let i = 0; i < 550; i++) {
      store.enqueueOfflineSale({ id: `s-${i}`, code: `V-${i}`, createdAt: Date.now() });
    }

    const queue = store.getState().offlineQueue;
    expect(queue.length).toBe(500); // cap aplicado
    expect(queue[0].id).toBe("s-50"); // las primeras 50 fueron descartadas
    expect(queue[499].id).toBe("s-549"); // la última
  });

  it("no descarta nada si la cola está por debajo del cap", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    for (let i = 0; i < 100; i++) {
      store.enqueueOfflineSale({ id: `s-${i}`, code: `V-${i}`, createdAt: Date.now() });
    }
    expect(store.getState().offlineQueue.length).toBe(100);
  });

  it("dequeueOfflineSale elimina la venta de la cola", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.enqueueOfflineSale({ id: "s-1" });
    store.enqueueOfflineSale({ id: "s-2" });
    expect(store.getState().offlineQueue.length).toBe(2);
    store.dequeueOfflineSale("s-1");
    expect(store.getState().offlineQueue.length).toBe(1);
    expect(store.getState().offlineQueue[0].id).toBe("s-2");
  });
});

describe("store.js — cart operations", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("addToCart añade producto nuevo", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addToCart({ id: "p1", name: "Aceite", salePrice: 10 }, 1);
    expect(store.getState().cart.length).toBe(1);
    expect(store.getState().cart[0].quantity).toBe(1);
    expect(store.getState().cart[0].subtotalUSD).toBe(10);
  });

  it("addToCart suma cantidad si ya existe", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addToCart({ id: "p1", name: "Aceite", salePrice: 10 }, 1);
    store.addToCart({ id: "p1", name: "Aceite", salePrice: 10 }, 2);
    expect(store.getState().cart.length).toBe(1);
    expect(store.getState().cart[0].quantity).toBe(3);
    expect(store.getState().cart[0].subtotalUSD).toBe(30);
  });

  it("removeFromCart elimina el producto", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addToCart({ id: "p1", name: "Aceite", salePrice: 10 }, 1);
    store.addToCart({ id: "p2", name: "Filtro", salePrice: 5 }, 1);
    store.removeFromCart("p1");
    expect(store.getState().cart.length).toBe(1);
    expect(store.getState().cart[0].productId).toBe("p2");
  });

  it("updateCartQty actualiza cantidad y subtotal", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addToCart({ id: "p1", name: "Aceite", salePrice: 10 }, 1);
    store.updateCartQty("p1", 5);
    expect(store.getState().cart[0].quantity).toBe(5);
    expect(store.getState().cart[0].subtotalUSD).toBe(50);
  });

  it("clearCart vacía el carrito", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addToCart({ id: "p1", name: "Aceite", salePrice: 10 }, 1);
    store.clearCart();
    expect(store.getState().cart.length).toBe(0);
  });

  it("cartTotal devuelve la suma de subtotales", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addToCart({ id: "p1", name: "A", salePrice: 10 }, 2); // 20
    store.addToCart({ id: "p2", name: "B", salePrice: 5 }, 3);  // 15
    expect(store.cartTotal()).toBe(35);
  });
});

describe("store.js — payments", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("addPayment y removePayment funcionan", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addPayment({ currency: "USD", amount: 10, amountUSD: 10 });
    store.addPayment({ currency: "MN", amount: 500, amountUSD: 5 });
    expect(store.getState().payments.length).toBe(2);
    expect(store.paymentsTotal()).toBe(15);
    store.removePayment(0);
    expect(store.getState().payments.length).toBe(1);
    expect(store.paymentsTotal()).toBe(5);
  });

  it("clearPayments vacía los pagos", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.addPayment({ currency: "USD", amount: 10, amountUSD: 10 });
    store.clearPayments();
    expect(store.getState().payments.length).toBe(0);
  });
});

describe("store.js — auth state", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("setUser + logout", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.setUser({ id: "u1", displayName: "Test", role: "admin" });
    store.setAuthMode("user");
    expect(store.getState().currentUser.id).toBe("u1");
    expect(store.getState().authMode).toBe("user");
    store.logout();
    expect(store.getState().currentUser).toBe(null);
    expect(store.getState().authMode).toBe(null);
  });
});

describe("store.js — warehouse", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("setWarehouse guarda el almacén activo", async () => {
    const { getStore } = await import("../js/store.js");
    const store = getStore();
    store.setWarehouse({ id: "wh1", name: "Víbora", code: "VIB" });
    expect(store.getState().currentWarehouse.code).toBe("VIB");
  });
});

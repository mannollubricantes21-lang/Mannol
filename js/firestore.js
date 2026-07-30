// =====================================================
// Firestore data-access helpers (async, lazy Firebase)
// =====================================================
// All functions gracefully return empty/default values when:
//   - Firebase isn't configured
//   - firebase-config.js is missing
//   - The CDN is unreachable
// =====================================================

import { getFirebase } from "./firebase.js";
import { getStore } from "./store.js";
import {
  DEMO_WAREHOUSES, DEMO_MANAGERS, DEMO_CARDS, DEMO_CATEGORIES,
  DEMO_PRODUCTS, DEMO_STOCK, DEMO_SALES, DEMO_RATE_CONFIG, DEMO_TODAY_RATES,
} from "./demo-data.js";

const noopUnsub = () => {};
const DEFAULT_SETTINGS = {
  pinCode: "2025",
  elToqueEnabled: true,
  elToqueMarkup: 5,
  businessName: "MANNOL",
  lastRateSync: null,
};

// Helper: get Firebase instance (cached)
async function fb() {
  return await getFirebase();
}

// Helper: is demo mode? (Firebase not configured or returns null)
let _demoChecked = false;
let _isDemo = true;
async function isDemo() {
  if (_demoChecked) return _isDemo;
  const f = await fb();
  _isDemo = !f;
  _demoChecked = true;
  return _isDemo;
}

// ============ Settings ============

export async function getSettings() {
  const f = await fb();
  if (!f) return { ...DEFAULT_SETTINGS };
  try {
    const ref = f.doc(f.db, "settings", "global");
    const snap = await f.getDoc(ref);
    if (snap.exists()) return { ...DEFAULT_SETTINGS, ...snap.data() };
    await f.setDoc(ref, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.warn("Settings load failed:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s) {
  const f = await fb();
  if (!f) return;
  const ref = f.doc(f.db, "settings", "global");
  try {
    await f.updateDoc(ref, s).catch(async () => {
      await f.setDoc(ref, s, { merge: true });
    });
  } catch (err) {
    console.error("saveSettings failed:", err);
  }
}

// ============ Warehouses ============

export async function listWarehouses() {
  const demo = await isDemo();
  if (demo) return DEMO_WAREHOUSES;
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, "warehouses"), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("listWarehouses failed:", err);
    return [];
  }
}

export function subscribeWarehouses(cb) {
  let unsub = noopUnsub;
  (async () => {
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      const q = f.query(f.collection(f.db, "warehouses"), f.orderBy("createdAt", "asc"));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch (err) {
      console.error("subscribeWarehouses failed:", err);
      cb([]);
    }
  })();
  return () => unsub();
}

export async function saveWarehouse(w) {
  const f = await fb();
  if (!f) return "demo-id";
  if (w.id) {
    await f.updateDoc(f.doc(f.db, "warehouses", w.id), w);
    return w.id;
  }
  const ref = f.doc(f.collection(f.db, "warehouses"));
  await f.setDoc(ref, { ...w, createdAt: Date.now() });
  return ref.id;
}

export async function deleteWarehouse(id) {
  const f = await fb();
  if (!f) return;
  await f.deleteDoc(f.doc(f.db, "warehouses", id));
}

// ============ Users ============

export async function listUsers() {
  const demo = await isDemo();
  if (demo) {
    return [
      { id: "u-admin", username: "admin", displayName: "Administrador", email: "admin@mannol.cu", role: "admin", active: true, warehouseId: null, createdAt: Date.now() - 86400000 * 90 },
      { id: "u-cen", username: "cen", displayName: "Vendedor Central", email: "cen@mannol.cu", role: "warehouse", active: true, warehouseId: "wh-vibora", warehouseName: "Víbora", warehouseCode: "VIB", createdAt: Date.now() - 86400000 * 60 },
      { id: "u-lisa", username: "lisa", displayName: "Vendedora Lisa", email: "lisa@mannol.cu", role: "warehouse", active: true, warehouseId: "wh-lisa", warehouseName: "Lisa", warehouseCode: "LIS", createdAt: Date.now() - 86400000 * 50 },
      { id: "u-playa", username: "playa", displayName: "Vendedor Playa", email: "playa@mannol.cu", role: "warehouse", active: true, warehouseId: "wh-playa", warehouseName: "Playa", warehouseCode: "PLY", createdAt: Date.now() - 86400000 * 40 },
    ];
  }
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, "users"), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function getUserByEmail(email) {
  const f = await fb();
  if (!f) return null;
  try {
    const q = f.query(f.collection(f.db, "users"), f.where("email", "==", email.toLowerCase()));
    const snap = await f.getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (err) {
    console.error("getUserByEmail failed:", err);
    return null;
  }
}

export async function saveUser(u) {
  const f = await fb();
  if (!f) return "demo-id";
  if (u.id) {
    await f.updateDoc(f.doc(f.db, "users", u.id), u);
    return u.id;
  }
  const ref = f.doc(f.collection(f.db, "users"));
  await f.setDoc(ref, { ...u, email: u.email.toLowerCase(), createdAt: Date.now() });
  return ref.id;
}

export async function deleteUser(id) {
  const f = await fb();
  if (!f) return;
  await f.deleteDoc(f.doc(f.db, "users", id));
}

// ============ Categories / Subcategories ============

export function subscribeCategories(cb) {
  let unsub = noopUnsub;
  (async () => {
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      const q = f.query(f.collection(f.db, "categories"), f.orderBy("order", "asc"));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch { cb([]); }
  })();
  return () => unsub();
}

export async function saveCategory(c) {
  const f = await fb();
  if (!f) return "demo-id";
  if (c.id) { await f.updateDoc(f.doc(f.db, "categories", c.id), c); return c.id; }
  const ref = f.doc(f.collection(f.db, "categories"));
  await f.setDoc(ref, c);
  return ref.id;
}

export async function deleteCategory(id) {
  const f = await fb();
  if (!f) return;
  await f.deleteDoc(f.doc(f.db, "categories", id));
}

export function subscribeSubcategories(cb) {
  let unsub = noopUnsub;
  (async () => {
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      const q = f.query(f.collection(f.db, "subcategories"), f.orderBy("order", "asc"));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch { cb([]); }
  })();
  return () => unsub();
}

export async function saveSubcategory(s) {
  const f = await fb();
  if (!f) return "demo-id";
  if (s.id) { await f.updateDoc(f.doc(f.db, "subcategories", s.id), s); return s.id; }
  const ref = f.doc(f.collection(f.db, "subcategories"));
  await f.setDoc(ref, s);
  return ref.id;
}

export async function deleteSubcategory(id) {
  const f = await fb();
  if (!f) return;
  await f.deleteDoc(f.doc(f.db, "subcategories", id));
}

// ============ Products ============

export function subscribeProducts(cb) {
  let unsub = noopUnsub;
  (async () => {
    const demo = await isDemo();
    if (demo) { cb(DEMO_PRODUCTS); return; }
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      const q = f.query(f.collection(f.db, "products"), f.orderBy("createdAt", "asc"));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch { cb([]); }
  })();
  return () => unsub();
}

export async function saveProduct(p) {
  const f = await fb();
  if (!f) return "demo-id";
  if (p.id) { await f.updateDoc(f.doc(f.db, "products", p.id), p); return p.id; }
  const ref = f.doc(f.collection(f.db, "products"));
  await f.setDoc(ref, { ...p, createdAt: Date.now() });
  return ref.id;
}

export async function deleteProduct(id) {
  const f = await fb();
  if (!f) return;
  await f.deleteDoc(f.doc(f.db, "products", id));
}

// ============ Stock ============

export function stockDocId(warehouseId, productId) {
  return `${warehouseId}_${productId}`;
}

export function subscribeStock(warehouseId, cb) {
  let unsub = noopUnsub;
  (async () => {
    const demo = await isDemo();
    if (demo) { cb(DEMO_STOCK.filter((s) => s.warehouseId === warehouseId)); return; }
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      const q = f.query(f.collection(f.db, "stock"), f.where("warehouseId", "==", warehouseId));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch { cb([]); }
  })();
  return () => unsub();
}

export async function setStock(warehouseId, productId, quantity, minStock = 0) {
  const f = await fb();
  if (!f) return;
  const id = stockDocId(warehouseId, productId);
  await f.setDoc(f.doc(f.db, "stock", id), {
    id, warehouseId, productId, quantity, minStock, updatedAt: Date.now(),
  }, { merge: true });
}

export async function adjustStock(warehouseId, productId, delta, reason = "AJUSTE_MANUAL", note = null, userId = null, userName = null) {
  const f = await fb();
  if (!f) return;
  const id = stockDocId(warehouseId, productId);
  const ref = f.doc(f.db, "stock", id);
  const snap = await f.getDoc(ref);
  let newQty;
  if (!snap.exists()) {
    newQty = Math.max(0, delta);
    await f.setDoc(ref, {
      id, warehouseId, productId,
      quantity: newQty, minStock: 0, updatedAt: Date.now(),
    });
  } else {
    const current = snap.data().quantity || 0;
    newQty = Math.max(0, current + delta);
    await f.updateDoc(ref, { quantity: newQty, updatedAt: Date.now() });
  }
  // Registrar movimiento de stock para auditoría
  try {
    const movRef = f.doc(f.collection(f.db, "stockMovements"));
    await f.setDoc(movRef, {
      warehouseId, productId, delta, reason, note, userId, userName, createdAt: Date.now(),
    });
  } catch (err) {
    console.warn("[adjustStock] No se pudo registrar movimiento:", err);
  }
}

// ============ Sales ============

export function subscribeSales(cb, filters = {}) {
  let unsub = noopUnsub;
  (async () => {
    const demo = await isDemo();
    if (demo) {
      let items = [...DEMO_SALES];
      if (filters.warehouseId) items = items.filter((s) => s.warehouseId === filters.warehouseId);
      items.sort((a, b) => b.createdAt - a.createdAt);
      cb(items);
      return;
    }
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      let q = f.collection(f.db, "sales");
      if (filters.warehouseId) {
        q = f.query(q, f.where("warehouseId", "==", filters.warehouseId));
      }
      q = f.query(q, f.orderBy("createdAt", "desc"));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch (err) {
      console.error("subscribeSales failed:", err);
      cb([]);
    }
  })();
  return () => unsub();
}

export async function listSales(filters = {}) {
  const demo = await isDemo();
  if (demo) {
    let items = [...DEMO_SALES];
    if (filters.warehouseId) items = items.filter((s) => s.warehouseId === filters.warehouseId);
    if (filters.userId) items = items.filter((s) => s.userId === filters.userId);
    if (filters.managerId) items = items.filter((s) => s.managerId === filters.managerId);
    if (filters.status) items = items.filter((s) => s.status === filters.status);
    if (filters.from) items = items.filter((s) => s.createdAt >= filters.from);
    if (filters.to) items = items.filter((s) => s.createdAt <= filters.to);
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  }
  const f = await fb();
  if (!f) return [];
  try {
    let q = f.collection(f.db, "sales");
    if (filters.warehouseId) q = f.query(q, f.where("warehouseId", "==", filters.warehouseId));
    if (filters.userId) q = f.query(q, f.where("userId", "==", filters.userId));
    if (filters.managerId) q = f.query(q, f.where("managerId", "==", filters.managerId));
    q = f.query(q, f.orderBy("createdAt", "desc"));
    const snap = await f.getDocs(q);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (filters.from) items = items.filter((i) => i.createdAt >= filters.from);
    if (filters.to) items = items.filter((i) => i.createdAt <= filters.to);
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    return items;
  } catch {
    return [];
  }
}

export async function saveSale(sale) {
  const f = await fb();
  if (!f) return;
  await f.setDoc(f.doc(f.db, "sales", sale.id), sale);
}

export async function updateSaleStatus(saleId, newStatus, reason = null, userId = null, userName = null) {
  const f = await fb();
  if (!f) return;
  const saleRef = f.doc(f.db, "sales", saleId);
  const snap = await f.getDoc(saleRef);
  if (!snap.exists()) throw new Error("Venta no encontrada");
  const sale = { id: snap.id, ...snap.data() };
  const oldStatus = sale.status;
  if (oldStatus === newStatus) return;

  const update = { status: newStatus };
  if (newStatus === "COMPLETADA") {
    update.completedAt = Date.now();
    // Descuento de stock
    for (const item of sale.items) {
      await adjustStock(sale.warehouseId, item.productId, -item.quantity, "VENTA", `Venta ${sale.code}`, userId, userName);
    }
  } else if (newStatus === "CANCELADA") {
    update.cancelledAt = Date.now();
    update.cancelReason = reason;
    // Restaurar stock si venía de COMPLETADA
    if (oldStatus === "COMPLETADA") {
      for (const item of sale.items) {
        await adjustStock(sale.warehouseId, item.productId, item.quantity, "CANCELACION", `Cancelación ${sale.code}`, userId, userName);
      }
    }
  }
  // REABRIR (CANCELADA → PENDIENTE): no toca stock
  await f.updateDoc(saleRef, update);
}

export async function cancelSale(saleId, reason) {
  return await updateSaleStatus(saleId, "CANCELADA", reason);
}

// ============ Rates ============

export function subscribeRates(cb) {
  let unsub = noopUnsub;
  (async () => {
    const demo = await isDemo();
    if (demo) {
      cb([
        { id: "USD", currency: "USD", rateUSD: 1, source: "manual", updatedAt: Date.now() - 3600000 },
        { id: "MN", currency: "MN", rateUSD: 1 / 320, source: "manual", updatedAt: Date.now() - 3600000 },
        { id: "EUR", currency: "EUR", rateUSD: 1.08, source: "manual", updatedAt: Date.now() - 3600000 },
        { id: "TRANSFERENCIA", currency: "TRANSFERENCIA", rateUSD: 1 / 320, source: "manual", updatedAt: Date.now() - 3600000 },
      ]);
      return;
    }
    const f = await fb();
    if (!f) { cb([]); return; }
    try {
      const q = f.query(f.collection(f.db, "rates"));
      unsub = f.onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    } catch { cb([]); }
  })();
  return () => unsub();
}

export async function saveRate(rate) {
  const f = await fb();
  if (!f) return;
  await f.setDoc(f.doc(f.db, "rates", rate.id), rate);
}

// Get today's rates with markup applied
export async function getTodayRates() {
  const demo = await isDemo();
  if (demo) return { ...DEMO_TODAY_RATES };

  const config = await getRateConfig();
  const now = Date.now();
  const cacheTtlMs = config.cacheTtlMinutes * 60 * 1000;
  const isStale = !config.lastSyncAt || (now - config.lastSyncAt > cacheTtlMs);

  // Auto-sync si está habilitado y el caché está vencido
  if (config.autoSync && isStale) {
    try { await syncRatesFromElToque(); } catch {}
  }

  const reloaded = await getRateConfig();
  if (reloaded.lastUsdRate && reloaded.lastEurRate) {
    return {
      usd: applyMarkup(reloaded.lastUsdRate, reloaded.markupMode, reloaded.markupUsd),
      eur: applyMarkup(reloaded.lastEurRate, reloaded.markupMode, reloaded.markupEur),
      rawUsd: reloaded.lastUsdRate,
      rawEur: reloaded.lastEurRate,
      source: "api",
      lastSyncAt: reloaded.lastSyncAt,
      markupMode: reloaded.markupMode,
      markupUsd: reloaded.markupUsd,
      markupEur: reloaded.markupEur,
    };
  }
  // Fallback manual
  return {
    usd: reloaded.manualUsdRate,
    eur: reloaded.manualEurRate,
    rawUsd: null,
    rawEur: null,
    source: "manual",
    lastSyncAt: reloaded.lastSyncAt,
    markupMode: reloaded.markupMode,
    markupUsd: reloaded.markupUsd,
    markupEur: reloaded.markupEur,
  };
}

// Get rate config
export async function getRateConfig() {
  const demo = await isDemo();
  if (demo) return { ...DEMO_RATE_CONFIG };
  const f = await fb();
  if (!f) return { ...DEMO_RATE_CONFIG };
  try {
    const ref = f.doc(f.db, "rateConfig", "default");
    const snap = await f.getDoc(ref);
    if (snap.exists()) return { ...DEMO_RATE_CONFIG, ...snap.data() };
    await f.setDoc(ref, DEMO_RATE_CONFIG);
    return { ...DEMO_RATE_CONFIG };
  } catch {
    return { ...DEMO_RATE_CONFIG };
  }
}

export async function saveRateConfig(config) {
  const f = await fb();
  if (!f) return;
  const ref = f.doc(f.db, "rateConfig", "default");
  try {
    await f.updateDoc(ref, config).catch(async () => {
      await f.setDoc(ref, config, { merge: true });
    });
  } catch (err) {
    console.error("saveRateConfig failed:", err);
  }
}

function applyMarkup(rawRate, mode, markup) {
  if (!rawRate || rawRate <= 0 || !Number.isFinite(rawRate)) return null;
  if (mode === "PERCENT") return rawRate * (1 + markup / 100);
  return rawRate + markup; // FIXED
}

// Sync rates from elToque API
export async function syncRatesFromElToque() {
  const config = await getRateConfig();
  const now = Date.now();
  let newUsd = null;
  let newEur = null;
  let source = "manual";

  if (config.apiToken) {
    try {
      const res = await fetch(config.apiUrl || "https://api.eltoque.com/v1/currency/rates", {
        headers: {
          Accept: "application/json",
          ...(config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : {}),
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        // Parser flexible (7 formatos)
        let rates = null;
        if (data?.rates) rates = data.rates;
        else if (data?.data?.rates) rates = data.data.rates;
        else if (Array.isArray(data)) {
          rates = {};
          data.forEach((r) => { if (r.currency && r.rate) rates[r.currency] = r.rate; });
        } else if (data?.USD_TO_MN) rates = { CUP: data.USD_TO_MN };
        else if (data?.USD?.rate) rates = { CUP: data.USD.rate };
        if (rates?.CUP) newUsd = parseFloat(rates.CUP);
        if (rates?.EUR) newEur = parseFloat(rates.EUR);
        if (newUsd) source = "api";
      }
    } catch (err) {
      console.warn("elToque sync failed:", err);
    }
  }

  // Mantener tasas previas si no hay nuevas
  const update = {
    lastSyncAt: now,
    lastUsdRate: newUsd || config.lastUsdRate || null,
    lastEurRate: newEur || config.lastEurRate || null,
  };
  await saveRateConfig(update);

  // Also persist to rates collection for client subscriptions
  const f = await fb();
  if (f) {
    const appliedUsd = applyMarkup(update.lastUsdRate || config.manualUsdRate, config.markupMode, config.markupUsd) || config.manualUsdRate || 320;
    const appliedEur = applyMarkup(update.lastEurRate || config.manualEurRate, config.markupMode, config.markupEur) || config.manualEurRate || 345;
    await saveRate({ id: "USD", currency: "USD", rateUSD: 1, source, updatedAt: now });
    await saveRate({ id: "MN", currency: "MN", rateUSD: 1 / appliedUsd, source, updatedAt: now });
    await saveRate({ id: "EUR", currency: "EUR", rateUSD: appliedEur / appliedUsd, source, updatedAt: now });
    await saveRate({ id: "TRANSFERENCIA", currency: "TRANSFERENCIA", rateUSD: 1 / appliedUsd, source, updatedAt: now });
    await saveSettings({ lastRateSync: now });
  }

  return { source, usd: update.lastUsdRate, eur: update.lastEurRate };
}

// Legacy function (kept for backwards compat with home.js)
export async function syncElToqueRates(markup) {
  const result = await syncRatesFromElToque();
  const config = await getRateConfig();
  const usd = result.usd || config.manualUsdRate || 320;
  const eur = result.eur || config.manualEurRate || 345;
  const appliedUsd = applyMarkup(usd, config.markupMode, config.markupUsd) || usd;
  const appliedEur = applyMarkup(eur, config.markupMode, config.markupEur) || eur;
  const now = Date.now();
  return [
    { id: "USD", currency: "USD", rateUSD: 1, source: result.source, updatedAt: now },
    { id: "MN", currency: "MN", rateUSD: 1 / appliedUsd, source: result.source, updatedAt: now },
    { id: "EUR", currency: "EUR", rateUSD: appliedEur / appliedUsd, source: result.source, updatedAt: now },
    { id: "TRANSFERENCIA", currency: "TRANSFERENCIA", rateUSD: 1 / appliedUsd, source: result.source, updatedAt: now },
  ];
}

// ============ Commissions (gestores) ============

export async function listManagerCommissions(year, month) {
  const demo = await isDemo();
  if (demo) {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = DEMO_SALES.filter((s) => s.createdAt >= from && s.createdAt < to && s.status === "COMPLETADA");
    return DEMO_MANAGERS.map((m) => {
      const managerSales = sales.filter((s) => s.managerId === m.id);
      let amountUSD = 0;
      let amountMN = 0;
      let totalUnits = 0;
      let totalSales = 0;
      for (const s of managerSales) {
        totalSales += s.totalAmount;
        for (const item of s.items) {
          totalUnits += item.quantity;
          // Usar gestorCommission (nuevo) o commission (legacy)
          const gCom = item.gestorCommission ?? item.commission ?? 0;
          const gCurr = item.gestorCommissionCurrency ?? item.commissionCurrency ?? "USD";
          if (gCurr === "USD") {
            amountUSD += gCom * item.quantity;
          } else {
            amountMN += gCom * item.quantity;
          }
        }
      }
      return {
        id: `${m.id}_${year}_${month}`,
        managerId: m.id,
        name: m.name,
        code: m.code,
        phone: m.phone,
        commission: m.commission,
        salesCount: managerSales.length,
        totalUnits,
        totalSales,
        amountUSD,
        amountMN,
        amount: amountUSD + amountMN * (getStore().getState().rates["MN"]?.rateUSD || (1/320)),
        paid: false,
        paidAt: null,
      };
    });
  }
  const f = await fb();
  if (!f) return [];
  try {
    // Check if there are payouts recorded
    const payoutsSnap = await f.getDocs(f.query(
      f.collection(f.db, "commissionPayouts"),
      f.where("year", "==", year),
      f.where("month", "==", month),
    ));
    const payouts = new Map(payoutsSnap.docs.map((d) => [d.data().managerId, d.data()]));

    // Calculate from sales
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = await listSales({ from, to });
    const completed = sales.filter((s) => s.status === "COMPLETADA");
    const managers = await listManagers();

    return managers.map((m) => {
      const managerSales = completed.filter((s) => s.managerId === m.id);
      let amountUSD = 0;
      let amountMN = 0;
      let totalUnits = 0;
      let totalSales = 0;
      for (const s of managerSales) {
        totalSales += s.totalAmount;
        for (const item of s.items) {
          totalUnits += item.quantity;
          // Usar gestorCommission (nuevo) o commission (legacy)
          const gCom = item.gestorCommission ?? item.commission ?? 0;
          const gCurr = item.gestorCommissionCurrency ?? item.commissionCurrency ?? "USD";
          if (gCurr === "USD") amountUSD += gCom * item.quantity;
          else amountMN += gCom * item.quantity;
        }
      }
      const payout = payouts.get(m.id);
      return {
        id: `${m.id}_${year}_${month}`,
        managerId: m.id,
        name: m.name,
        code: m.code,
        phone: m.phone,
        commission: m.commission,
        salesCount: managerSales.length,
        totalUnits,
        totalSales,
        amountUSD,
        amountMN,
        amount: amountUSD + amountMN * (getStore().getState().rates["MN"]?.rateUSD || (1/320)),
        paid: !!payout,
        paidAt: payout?.paidAt || null,
      };
    });
  } catch { return []; }
}

export async function markManagerCommissionPaid(managerId, year, month, paid, paidBy = null) {
  const f = await fb();
  if (!f) return;
  const id = `${managerId}_${year}_${month}`;
  const ref = f.doc(f.db, "commissionPayouts", id);
  if (paid) {
    await f.setDoc(ref, {
      id, managerId, year, month,
      paidAt: Date.now(), paidBy,
    }, { merge: true });
  } else {
    await f.deleteDoc(ref).catch(() => {});
  }
}

// ============ Commissions (vendedores locales) ============

export async function listWarehouseCommissions(year, month) {
  const demo = await isDemo();
  if (demo) {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = DEMO_SALES.filter((s) => s.createdAt >= from && s.createdAt < to && s.status === "COMPLETADA");
    return DEMO_WAREHOUSES.map((w) => {
      const warehouseSales = sales.filter((s) => s.warehouseId === w.id);
      const totalSales = warehouseSales.reduce((sum, s) => sum + s.totalAmount, 0);
      const amount = totalSales * w.sellerCommissionPercent / 100;
      return {
        id: `${w.id}_${year}_${month}`,
        warehouseId: w.id,
        warehouseName: w.name,
        warehouseCode: w.code,
        sellerId: null,
        sellerName: null,
        salesCount: warehouseSales.length,
        totalSales,
        commissionPercent: w.sellerCommissionPercent,
        commissionCurrency: w.sellerCommissionCurrency,
        amountUSD: w.sellerCommissionCurrency === "USD" ? amount : 0,
        amountMN: w.sellerCommissionCurrency === "MN" ? amount : 0,
        amount,
      };
    });
  }
  const f = await fb();
  if (!f) return [];
  try {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = await listSales({ from, to });
    const completed = sales.filter((s) => s.status === "COMPLETADA");
    const warehouses = await listWarehouses();
    return warehouses.map((w) => {
      const warehouseSales = completed.filter((s) => s.warehouseId === w.id);
      const totalSales = warehouseSales.reduce((sum, s) => sum + s.totalAmount, 0);
      const amount = totalSales * (w.sellerCommissionPercent || 0) / 100;
      return {
        id: `${w.id}_${year}_${month}`,
        warehouseId: w.id,
        warehouseName: w.name,
        warehouseCode: w.code,
        sellerId: null,
        sellerName: null,
        salesCount: warehouseSales.length,
        totalSales,
        commissionPercent: w.sellerCommissionPercent || 0,
        commissionCurrency: w.sellerCommissionCurrency || "USD",
        amountUSD: (w.sellerCommissionCurrency || "USD") === "USD" ? amount : 0,
        amountMN: (w.sellerCommissionCurrency || "USD") === "MN" ? amount : 0,
        amount,
      };
    });
  } catch { return []; }
}

// ============ Transfers ============

export async function listTransfers(filters = {}) {
  const sales = await listSales(filters);
  return sales
    .filter((s) => s.currency === "TRANSFERENCIA" || (s.paymentMethod === "TRANSFERENCIA" && s.currency !== "TRANSFERENCIA") || (s.paidTransfer && s.paidTransfer > 0))
    .map((s) => ({
      id: s.id,
      code: s.code,
      createdAt: s.createdAt,
      status: s.status,
      warehouseId: s.warehouseId,
      warehouseName: s.warehouseName,
      warehouseCode: s.warehouseCode,
      managerName: s.managerName,
      managerCode: s.managerCode,
      customerName: s.customerName,
      cardId: s.cardId,
      cardNumber: s.cardNumber,
      cardName: s.cardName,
      cardBank: null,
      transferAmount: s.transferAmount || s.paidTransfer || 0,
      totalAmount: s.totalAmount,
      products: s.items.map((i) => ({ name: i.productName, brand: i.brand, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
      productsSummary: s.items.map((i) => `${i.quantity}x ${i.productName}`).join(", "),
    }));
}

// ============ Warehouse summary (post-PIN) ============

export async function getWarehouseSummary(warehouseId, period = "today") {
  const demo = await isDemo();
  if (demo) {
    const now = new Date();
    let from;
    if (period === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === "week") {
      from = now.getTime() - 7 * 86400000;
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }
    const sales = DEMO_SALES.filter((s) => s.warehouseId === warehouseId && s.createdAt >= from);
    const completed = sales.filter((s) => s.status === "COMPLETADA");
    const stock = DEMO_STOCK.filter((s) => s.warehouseId === warehouseId);
    const warehouse = DEMO_WAREHOUSES.find((w) => w.id === warehouseId);

    const byCurrency = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
    for (const s of completed) {
      if (s.currency === "USD") byCurrency.USD += s.totalAmount;
      else if (s.currency === "MN") byCurrency.MN += s.totalAmount;
      else if (s.currency === "EUR") byCurrency.EUR += s.totalAmount;
      else if (s.currency === "TRANSFERENCIA") byCurrency.TRANSFERENCIA += s.totalAmount;
    }

    return {
      warehouse,
      period,
      kpis: {
        salesCount: completed.length,
        unitsSold: completed.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0),
        byCurrency,
      },
      today: {
        salesCount: completed.length,
        unitsSold: completed.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0),
        byCurrency,
      },
      stock: {
        totalUnits: stock.reduce((sum, s) => sum + s.quantity, 0),
        totalValue: stock.reduce((sum, s) => {
          const product = DEMO_PRODUCTS.find((p) => p.id === s.productId);
          return sum + (s.quantity * (s.localPrice || product?.salePrice || 0));
        }, 0),
        totalSkus: stock.length,
        lowStockCount: stock.filter((s) => s.quantity <= (s.minStock || 5)).length,
        outOfStockCount: stock.filter((s) => s.quantity === 0).length,
        products: stock.map((s) => {
          const product = DEMO_PRODUCTS.find((p) => p.id === s.productId);
          return {
            id: product?.id,
            name: product?.name,
            brand: product?.brand,
            viscosity: product?.viscosity,
            sku: product?.sku,
            imageUrl: product?.imageUrl,
            quantity: s.quantity,
            price: s.localPrice || product?.salePrice,
            minStock: s.minStock || product?.minStock,
            isLow: s.quantity <= (s.minStock || 5),
            isOut: s.quantity === 0,
          };
        }),
      },
    };
  }
  // Firebase: combine sales + stock
  const f = await fb();
  if (!f) return null;
  // TODO: implement for Firebase
  return null;
}

// ============ Warehouse history (post-PIN) ============

export async function getWarehouseHistory(warehouseId, status = "all") {
  const demo = await isDemo();
  if (demo) {
    let sales = DEMO_SALES.filter((s) => s.warehouseId === warehouseId);
    if (status !== "all") sales = sales.filter((s) => s.status === status);
    sales.sort((a, b) => b.createdAt - a.createdAt);
    // Group by day
    const days = {};
    for (const s of sales) {
      const d = new Date(s.createdAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!days[dateKey]) {
        days[dateKey] = { date: dateKey, count: 0, byCurrency: { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 }, sales: [] };
      }
      days[dateKey].count++;
      if (s.currency) days[dateKey].byCurrency[s.currency] = (days[dateKey].byCurrency[s.currency] || 0) + s.totalAmount;
      days[dateKey].sales.push(s);
    }
    const summary = {
      count: sales.length,
      byCurrency: { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 },
    };
    for (const s of sales) {
      if (s.currency) summary.byCurrency[s.currency] = (summary.byCurrency[s.currency] || 0) + s.totalAmount;
    }
    return {
      warehouse: DEMO_WAREHOUSES.find((w) => w.id === warehouseId),
      summary,
      days: Object.values(days).sort((a, b) => b.date.localeCompare(a.date)),
      generatedAt: Date.now(),
    };
  }
  // Firebase: implement
  return null;
}

// ============ Managers (gestores) ============

export async function listManagers() {
  const demo = await isDemo();
  if (demo) {
    return DEMO_MANAGERS.map((m) => {
      const sales = DEMO_SALES.filter((s) => s.managerId === m.id);
      const completadas = sales.filter((s) => s.status === "COMPLETADA");
      const pendientes = sales.filter((s) => s.status === "PENDIENTE");
      const canceladas = sales.filter((s) => s.status === "CANCELADA");
      const montoTotal = completadas.reduce((sum, s) => sum + s.totalAmount, 0);
      return {
        ...m,
        totalReferidos: sales.length,
        completadas: completadas.length,
        pendientes: pendientes.length,
        canceladas: canceladas.length,
        montoTotal,
        comisionEstimada: montoTotal * m.commission / 100,
      };
    });
  }
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, "managers"), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

export async function saveManager(m) {
  const f = await fb();
  if (!f) return "demo-id";
  if (m.id) { await f.updateDoc(f.doc(f.db, "managers", m.id), m); return m.id; }
  const ref = f.doc(f.collection(f.db, "managers"));
  await f.setDoc(ref, { ...m, code: m.code.toUpperCase(), createdAt: Date.now() });
  return ref.id;
}

export async function deleteManager(id) {
  const f = await fb();
  if (!f) return;
  await f.deleteDoc(f.doc(f.db, "managers", id));
}

// ============ Cards (tarjetas) ============

export async function listCards() {
  const demo = await isDemo();
  if (demo) return DEMO_CARDS;
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, "cards"), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

export async function saveCard(c) {
  const f = await fb();
  if (!f) return "demo-id";
  if (c.id) { await f.updateDoc(f.doc(f.db, "cards", c.id), c); return c.id; }
  const ref = f.doc(f.collection(f.db, "cards"));
  await f.setDoc(ref, { ...c, createdAt: Date.now() });
  return ref.id;
}

export async function deleteCard(id) {
  const f = await fb();
  if (!f) return;
  await f.updateDoc(f.doc(f.db, "cards", id), { active: false });
}

// ============ Products (list, not subscribe) ============

export async function listProducts() {
  const demo = await isDemo();
  if (demo) return DEMO_PRODUCTS;
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, "products"), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ============ Categories (list, not subscribe) ============

export async function listCategories() {
  const demo = await isDemo();
  if (demo) return DEMO_CATEGORIES;
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, "categories"), f.orderBy("sortOrder", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ============ Stock list (not subscribe) ============

export async function listStock(warehouseId) {
  const demo = await isDemo();
  if (demo) return warehouseId ? DEMO_STOCK.filter((s) => s.warehouseId === warehouseId) : DEMO_STOCK;
  const f = await fb();
  if (!f) return [];
  try {
    let q = f.collection(f.db, "stock");
    if (warehouseId) q = f.query(q, f.where("warehouseId", "==", warehouseId));
    const snap = await f.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ============ Stock movements (auditoría) ============

export async function listStockMovements(filters = {}) {
  const demo = await isDemo();
  if (demo) return [];
  const f = await fb();
  if (!f) return [];
  try {
    let q = f.collection(f.db, "stockMovements");
    if (filters.warehouseId) q = f.query(q, f.where("warehouseId", "==", filters.warehouseId));
    if (filters.productId) q = f.query(q, f.where("productId", "==", filters.productId));
    q = f.query(q, f.orderBy("createdAt", "desc"));
    const snap = await f.getDocs(q);
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (filters.limit) items = items.slice(0, filters.limit);
    return items;
  } catch { return []; }
}

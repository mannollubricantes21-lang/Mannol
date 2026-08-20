// =====================================================
// Data-access layer — Supabase (mirrors firestore.js API)
// =====================================================
// All functions gracefully return empty/default values when:
//   - Supabase isn't configured
//   - supabase-config.js is missing
//   - The CDN is unreachable
//
// API surface is identical to the old firestore.js so views
// don't need changes.
// =====================================================

import {
  getSupabase,
  isSupabaseConfiguredAsync,
  camelToSnake,
  snakeToCamel,
  msToIso,
  isoToMs,
} from "./supabase.js";
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

// Helper: get Supabase instance (cached)
async function sb() {
  return await getSupabase();
}

// Helper: is demo mode? (Supabase not configured or returns null)
let _demoChecked = false;
let _isDemo = true;
async function isDemo() {
  if (_demoChecked) return _isDemo;
  const s = await sb();
  _isDemo = !s;
  _demoChecked = true;
  return _isDemo;
}

// =====================================================
// Conversion helpers
// =====================================================
// Convert a Supabase row (snake_case ISO timestamps) → JS object (camelCase ms timestamps)
function row(row) {
  if (!row) return null;
  const camel = snakeToCamel(row);
  // Convert known timestamp fields
  ["createdAt", "updatedAt", "lastSyncAt", "lastRateSync", "completedAt", "cancelledAt", "paidAt", "syncedAt"].forEach((f) => {
    if (camel[f] !== undefined && camel[f] !== null) {
      camel[f] = isoToMs(camel[f]);
    }
  });
  return camel;
}

function rows(arr) {
  return (arr || []).map(row);
}

// Convert JS object → Supabase row (snake_case, ISO timestamps)
function toRow(obj) {
  const snake = camelToSnake(obj);
  ["createdAt", "updatedAt", "lastSyncAt", "lastRateSync", "completedAt", "cancelledAt", "paidAt", "syncedAt"].forEach((f) => {
    const snakeField = f.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
    if (snake[snakeField] !== undefined && snake[snakeField] !== null) {
      snake[snakeField] = msToIso(snake[snakeField]);
    }
  });
  return snake;
}

// =====================================================
// Realtime subscription helper
// =====================================================
// Creates a Supabase realtime channel that watches a table and
// re-fetches the full list on any change (simple + reliable).
function subscribeTable({ channelName, table, filter, order, fn, demoData, isDemoMode }) {
  let unsub = noopUnsub;
  (async () => {
    if (isDemoMode) {
      cb_with_demo();
      return;
    }
    const s = await sb();
    if (!s) { fn([]); return; }
    try {
      // Initial fetch
      await refresh();
      // Subscribe to changes
      const channel = s.channel(channelName);
      const filterObj = { event: "*", schema: "public", table };
      if (filter) filterObj.filter = filter;
      channel.on("postgres_changes", filterObj, () => {
        // Re-fetch full list on any change
        refresh();
      });
      channel.subscribe();
      unsub = () => {
        try { s.client.removeChannel(channel); } catch {}
      };
    } catch (err) {
      console.error(`subscribe ${table} failed:`, err);
      fn([]);
    }
  })();

  async function refresh() {
    const s = await sb();
    if (!s) { fn([]); return; }
    try {
      let query = s.from(table).select("*");
      if (filter) {
        // filter is an array of [column, op, value]
        for (const [col, op, val] of filter) {
          if (op === "eq") query = query.eq(col, val);
          else if (op === "in") query = query.in(col, val);
        }
      }
      if (order) query = query.order(order[0], { ascending: order[1] === "asc" });
      const { data, error } = await query;
      if (error) throw error;
      fn(rows(data));
    } catch (err) {
      console.error(`refresh ${table} failed:`, err);
      fn([]);
    }
  }

  function cb_with_demo() {
    let items = demoData || [];
    if (order) items = [...items].sort((a, b) => {
      const va = a[order[0]] || 0;
      const vb = b[order[0]] || 0;
      return order[1] === "asc" ? va - vb : vb - va;
    });
    fn(items);
  }

  return () => unsub();
}

// =====================================================
// ============ Settings ============
// =====================================================

export async function getSettings() {
  const demo = await isDemo();
  if (demo) return { ...DEFAULT_SETTINGS };
  const s = await sb();
  if (!s) return { ...DEFAULT_SETTINGS };
  try {
    const { data, error } = await s.from("settings").select("*").eq("id", "global").maybeSingle();
    if (error) throw error;
    if (data) {
      const r = row(data);
      return { ...DEFAULT_SETTINGS, ...r };
    }
    // Create default row if missing
    const insertRow = toRow({ id: "global", ...DEFAULT_SETTINGS });
    const { error: insErr } = await s.from("settings").insert(insertRow);
    if (insErr) console.warn("[getSettings] insert default failed:", insErr);
    return { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.warn("Settings load failed:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  const s = await sb();
  if (!s) return;
  try {
    const update = { ...toRow(settings), id: "global" };
    const { error } = await s.from("settings").upsert(update, { onConflict: "id" });
    if (error) throw error;
  } catch (err) {
    console.error("saveSettings failed:", err);
  }
}

// =====================================================
// ============ Warehouses ============
// =====================================================

export async function listWarehouses() {
  const demo = await isDemo();
  if (demo) return DEMO_WAREHOUSES;
  const s = await sb();
  if (!s) return [];
  try {
    const { data, error } = await s.from("warehouses").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch (err) {
    console.error("listWarehouses failed:", err);
    return [];
  }
}

export function subscribeWarehouses(cb) {
  return subscribeTable({
    channelName: "warehouses-ch",
    table: "warehouses",
    order: ["created_at", "asc"],
    fn: cb,
    demoData: DEMO_WAREHOUSES,
    isDemoMode: false, // will be checked inside
  });
}

export async function saveWarehouse(w) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const r = toRow({ ...w, createdAt: w.createdAt || Date.now() });
    if (w.id) {
      const { error } = await s.from("warehouses").update(r).eq("id", w.id);
      if (error) throw error;
      return w.id;
    }
    const { data, error } = await s.from("warehouses").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveWarehouse failed:", err);
    return "demo-id";
  }
}

export async function deleteWarehouse(id) {
  const s = await sb();
  if (!s) return;
  try {
    const { error } = await s.from("warehouses").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteWarehouse failed:", err);
  }
}

// =====================================================
// ============ Users ============
// =====================================================

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
  const s = await sb();
  if (!s) return [];
  try {
    const { data, error } = await s.from("users").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch {
    return [];
  }
}

export async function getUserByEmail(email) {
  const s = await sb();
  if (!s) return null;
  try {
    const { data, error } = await s.from("users").select("*").eq("email", email.toLowerCase()).maybeSingle();
    if (error) throw error;
    return data ? row(data) : null;
  } catch (err) {
    console.error("getUserByEmail failed:", err);
    return null;
  }
}

export async function saveUser(u) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const r = toRow({
      ...u,
      email: (u.email || "").toLowerCase(),
      username: (u.username || "").toLowerCase(),
      createdAt: u.createdAt || Date.now(),
    });
    if (u.id) {
      // Update existing user
      const { error } = await s.from("users").update(r).eq("id", u.id);
      if (error) throw error;
      // If password provided, change it via RPC
      if (u.password) {
        const { error: pwdErr } = await s.client.rpc("change_user_password", {
          p_user_id: u.id,
          p_new_password: u.password,
        });
        if (pwdErr) throw pwdErr;
      }
      return u.id;
    }
    // New user → use RPC that creates auth user + profile atomically
    if (u.password) {
      const { data, error } = await s.client.rpc("create_admin_user", {
        p_email: u.email,
        p_password: u.password,
        p_username: u.username,
        p_display_name: u.displayName || u.username,
        p_role: u.role || "warehouse",
        p_warehouse_ids: u.warehouseIds || [],
      });
      if (error) throw error;
      return data;
    }
    // No password → just insert profile (admin will create auth user separately)
    const { data, error } = await s.from("users").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveUser failed:", err);
    throw err;
  }
}

export async function deleteUser(id) {
  const s = await sb();
  if (!s) return;
  try {
    // Use RPC for safe soft-delete (deactivates profile + bans auth user)
    const { error } = await s.client.rpc("deactivate_user", { p_user_id: id });
    if (error) throw error;
  } catch (err) {
    console.error("deleteUser failed:", err);
    throw err;
  }
}

// =====================================================
// ============ Categories / Subcategories ============
// =====================================================

export function subscribeCategories(cb) {
  return subscribeTable({
    channelName: "categories-ch",
    table: "categories",
    order: ["sort_order", "asc"],
    fn: cb,
    demoData: DEMO_CATEGORIES,
    isDemoMode: false,
  });
}

export async function saveCategory(c) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    // Normalize: support both 'order' (legacy) and 'sortOrder' (canonical)
    const normalized = { ...c };
    if (normalized.order !== undefined && normalized.sortOrder === undefined) {
      normalized.sortOrder = normalized.order;
      delete normalized.order;
    }
    const r = toRow(normalized);
    if (c.id) {
      const { error } = await s.from("categories").update(r).eq("id", c.id);
      if (error) throw error;
      return c.id;
    }
    const { data, error } = await s.from("categories").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveCategory failed:", err);
    return "demo-id";
  }
}

export async function deleteCategory(id) {
  const s = await sb();
  if (!s) return;
  try {
    const { error } = await s.from("categories").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteCategory failed:", err);
  }
}

export function subscribeSubcategories(cb) {
  return subscribeTable({
    channelName: "subcategories-ch",
    table: "subcategories",
    order: ["sort_order", "asc"],
    fn: cb,
    isDemoMode: false,
  });
}

export async function saveSubcategory(sc) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const normalized = { ...sc };
    if (normalized.order !== undefined && normalized.sortOrder === undefined) {
      normalized.sortOrder = normalized.order;
      delete normalized.order;
    }
    const r = toRow(normalized);
    if (sc.id) {
      const { error } = await s.from("subcategories").update(r).eq("id", sc.id);
      if (error) throw error;
      return sc.id;
    }
    const { data, error } = await s.from("subcategories").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveSubcategory failed:", err);
    return "demo-id";
  }
}

export async function deleteSubcategory(id) {
  const s = await sb();
  if (!s) return;
  try {
    const { error } = await s.from("subcategories").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteSubcategory failed:", err);
  }
}

// =====================================================
// ============ Products ============
// =====================================================

export function subscribeProducts(cb) {
  let unsub = noopUnsub;
  (async () => {
    const demo = await isDemo();
    if (demo) { cb(DEMO_PRODUCTS); return; }
    const s = await sb();
    if (!s) { cb([]); return; }
    try {
      await refresh();
      const channel = s.channel("products-ch");
      channel.on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => refresh());
      channel.subscribe();
      unsub = () => { try { s.client.removeChannel(channel); } catch {} };
    } catch (err) {
      console.error("subscribeProducts failed:", err);
      cb([]);
    }
    async function refresh() {
      try {
        const { data, error } = await s.from("products").select("*").order("created_at", { ascending: true });
        if (error) throw error;
        cb(rows(data));
      } catch (err) {
        console.error("refresh products failed:", err);
        cb([]);
      }
    }
  })();
  return () => unsub();
}

export async function saveProduct(p) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const r = toRow({ ...p, createdAt: p.createdAt || Date.now() });
    if (p.id) {
      const { error } = await s.from("products").update(r).eq("id", p.id);
      if (error) throw error;
      return p.id;
    }
    const { data, error } = await s.from("products").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveProduct failed:", err);
    return "demo-id";
  }
}

export async function deleteProduct(id) {
  const s = await sb();
  if (!s) return;
  try {
    const { error } = await s.from("products").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteProduct failed:", err);
  }
}

export async function listProducts() {
  const demo = await isDemo();
  if (demo) return DEMO_PRODUCTS;
  const s = await sb();
  if (!s) return [];
  try {
    const { data, error } = await s.from("products").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch {
    return [];
  }
}

export async function listCategories() {
  const demo = await isDemo();
  if (demo) return DEMO_CATEGORIES;
  const s = await sb();
  if (!s) return [];
  try {
    // BUG FIX: usar sort_order consistentemente (antes usaba sortOrder que no existe en DB)
    const { data, error } = await s.from("categories").select("*").order("sort_order", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch {
    return [];
  }
}

// =====================================================
// ============ Stock ============
// =====================================================

export function stockDocId(warehouseId, productId) {
  return `${warehouseId}_${productId}`;
}

export function subscribeStock(warehouseId, cb) {
  let unsub = noopUnsub;
  (async () => {
    const demo = await isDemo();
    if (demo) { cb(DEMO_STOCK.filter((s) => s.warehouseId === warehouseId)); return; }
    const s = await sb();
    if (!s) { cb([]); return; }
    try {
      await refresh();
      const channel = s.channel(`stock-${warehouseId}-ch`);
      channel.on("postgres_changes",
        { event: "*", schema: "public", table: "stock", filter: `warehouse_id=eq.${warehouseId}` },
        () => refresh()
      );
      channel.subscribe();
      unsub = () => { try { s.client.removeChannel(channel); } catch {} };
    } catch (err) {
      console.error("subscribeStock failed:", err);
      cb([]);
    }
    async function refresh() {
      try {
        const { data, error } = await s.from("stock").select("*").eq("warehouse_id", warehouseId);
        if (error) throw error;
        cb(rows(data));
      } catch (err) {
        console.error("refresh stock failed:", err);
        cb([]);
      }
    }
  })();
  return () => unsub();
}

export async function setStock(warehouseId, productId, quantity, minStock = 0) {
  const s = await sb();
  if (!s) return;
  const id = stockDocId(warehouseId, productId);
  try {
    const r = toRow({ id, warehouseId, productId, quantity, minStock, updatedAt: Date.now() });
    const { error } = await s.from("stock").upsert(r, { onConflict: "id" });
    if (error) throw error;
  } catch (err) {
    console.error("setStock failed:", err);
  }
}

export async function adjustStock(warehouseId, productId, delta, reason = "AJUSTE_MANUAL", note = null, userId = null, userName = null) {
  const s = await sb();
  if (!s) return;
  try {
    // Use atomic RPC to avoid race conditions
    const { error } = await s.client.rpc("adjust_stock", {
      p_warehouse_id: warehouseId,
      p_product_id: productId,
      p_delta: delta,
      p_reason: reason,
      p_note: note,
      p_user_id: userId,
      p_user_name: userName,
    });
    if (error) throw error;
  } catch (err) {
    console.error("adjustStock failed:", err);
  }
}

export async function listStock(warehouseId) {
  const demo = await isDemo();
  if (demo) return warehouseId ? DEMO_STOCK.filter((s) => s.warehouseId === warehouseId) : DEMO_STOCK;
  const s = await sb();
  if (!s) return [];
  try {
    let query = s.from("stock").select("*");
    if (warehouseId) query = query.eq("warehouse_id", warehouseId);
    const { data, error } = await query;
    if (error) throw error;
    return rows(data);
  } catch {
    return [];
  }
}

export async function listStockMovements(filters = {}) {
  const demo = await isDemo();
  if (demo) return [];
  const s = await sb();
  if (!s) return [];
  try {
    let query = s.from("stock_movements").select("*");
    if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
    if (filters.productId) query = query.eq("product_id", filters.productId);
    query = query.order("created_at", { ascending: false });
    if (filters.limit) query = query.limit(filters.limit);
    const { data, error } = await query;
    if (error) throw error;
    return rows(data);
  } catch {
    return [];
  }
}

// =====================================================
// ============ Sales ============
// =====================================================

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
    const s = await sb();
    if (!s) { cb([]); return; }
    try {
      await refresh();
      const channelName = `sales-${filters.warehouseId || "all"}-ch`;
      const channel = s.channel(channelName);
      const changesFilter = { event: "*", schema: "public", table: "sales" };
      if (filters.warehouseId) changesFilter.filter = `warehouse_id=eq.${filters.warehouseId}`;
      channel.on("postgres_changes", changesFilter, () => refresh());
      channel.subscribe();
      unsub = () => { try { s.client.removeChannel(channel); } catch {} };
    } catch (err) {
      console.error("subscribeSales failed:", err);
      cb([]);
    }
    async function refresh() {
      try {
        let query = s.from("sales").select("*");
        if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
        if (filters.userId) query = query.eq("user_id", filters.userId);
        if (filters.managerId) query = query.eq("manager_id", filters.managerId);
        query = query.order("created_at", { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        let items = rows(data);
        if (filters.from) items = items.filter((i) => i.createdAt >= filters.from);
        if (filters.to) items = items.filter((i) => i.createdAt <= filters.to);
        if (filters.status) items = items.filter((i) => i.status === filters.status);
        cb(items);
      } catch (err) {
        console.error("refresh sales failed:", err);
        cb([]);
      }
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
  const s = await sb();
  if (!s) return [];
  try {
    let query = s.from("sales").select("*");
    if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.managerId) query = query.eq("manager_id", filters.managerId);
    query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    let items = rows(data);
    if (filters.from) items = items.filter((i) => i.createdAt >= filters.from);
    if (filters.to) items = items.filter((i) => i.createdAt <= filters.to);
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    return items;
  } catch {
    return [];
  }
}

export async function saveSale(sale) {
  const s = await sb();
  if (!s) return;
  try {
    // Idempotency via client_ref unique constraint
    const r = toRow({ ...sale, syncedAt: sale.syncedAt || Date.now() });
    const { error } = await s.from("sales").upsert(r, { onConflict: "id" });
    if (error) {
      // If duplicate client_ref, treat as success (idempotent)
      if (error.code === "23505" && error.message.includes("client_ref")) {
        console.info(`[saveSale] Duplicate client_ref detected — skipping (idempotent)`);
        return;
      }
      throw error;
    }
  } catch (err) {
    console.error("saveSale failed:", err);
    throw err;
  }
}

export async function updateSaleStatus(saleId, newStatus, reason = null, userId = null, userName = null) {
  const s = await sb();
  if (!s) return;
  try {
    // Use atomic RPC (handles stock deduction/restoration atomically)
    const { error } = await s.client.rpc("update_sale_status", {
      p_sale_id: saleId,
      p_new_status: newStatus,
      p_reason: reason,
      p_user_id: userId,
      p_user_name: userName,
    });
    if (error) throw error;
  } catch (err) {
    console.error("updateSaleStatus failed:", err);
    throw err;
  }
}

export async function cancelSale(saleId, reason) {
  return await updateSaleStatus(saleId, "CANCELADA", reason);
}

// =====================================================
// ============ Rates ============
// =====================================================

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
    const s = await sb();
    if (!s) { cb([]); return; }
    try {
      await refresh();
      const channel = s.channel("rates-ch");
      channel.on("postgres_changes", { event: "*", schema: "public", table: "rates" }, () => refresh());
      channel.subscribe();
      unsub = () => { try { s.client.removeChannel(channel); } catch {} };
    } catch (err) {
      console.error("subscribeRates failed:", err);
      cb([]);
    }
    async function refresh() {
      try {
        const { data, error } = await s.from("rates").select("*");
        if (error) throw error;
        cb(rows(data).map((r) => ({ ...r, id: r.currency })));
      } catch (err) {
        console.error("refresh rates failed:", err);
        cb([]);
      }
    }
  })();
  return () => unsub();
}

export async function saveRate(rate) {
  const s = await sb();
  if (!s) return;
  try {
    const r = toRow({ ...rate, currency: rate.id || rate.currency });
    const { error } = await s.from("rates").upsert(r, { onConflict: "currency" });
    if (error) throw error;
  } catch (err) {
    console.error("saveRate failed:", err);
  }
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

export async function getRateConfig() {
  const demo = await isDemo();
  if (demo) return { ...DEMO_RATE_CONFIG };
  const s = await sb();
  if (!s) return { ...DEMO_RATE_CONFIG };
  try {
    const { data, error } = await s.from("rate_config").select("*").eq("id", "default").maybeSingle();
    if (error) throw error;
    if (data) return { ...DEMO_RATE_CONFIG, ...row(data) };
    // Create default
    const r = toRow({ id: "default", ...DEMO_RATE_CONFIG });
    await s.from("rate_config").insert(r).catch(() => {});
    return { ...DEMO_RATE_CONFIG };
  } catch {
    return { ...DEMO_RATE_CONFIG };
  }
}

export async function saveRateConfig(config) {
  const s = await sb();
  if (!s) return;
  try {
    const r = toRow({ ...config, id: "default" });
    const { error } = await s.from("rate_config").upsert(r, { onConflict: "id" });
    if (error) throw error;
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

  const update = {
    lastSyncAt: now,
    lastUsdRate: newUsd || config.lastUsdRate || null,
    lastEurRate: newEur || config.lastEurRate || null,
  };
  await saveRateConfig(update);

  const appliedUsd = applyMarkup(update.lastUsdRate || config.manualUsdRate, config.markupMode, config.markupUsd) || config.manualUsdRate || 320;
  const appliedEur = applyMarkup(update.lastEurRate || config.manualEurRate, config.markupMode, config.markupEur) || config.manualEurRate || 345;
  await saveRate({ id: "USD", currency: "USD", rateUSD: 1, source, updatedAt: now });
  await saveRate({ id: "MN", currency: "MN", rateUSD: 1 / appliedUsd, source, updatedAt: now });
  await saveRate({ id: "EUR", currency: "EUR", rateUSD: appliedEur / appliedUsd, source, updatedAt: now });
  await saveRate({ id: "TRANSFERENCIA", currency: "TRANSFERENCIA", rateUSD: 1 / appliedUsd, source, updatedAt: now });
  await saveSettings({ lastRateSync: now });

  return { source, usd: update.lastUsdRate, eur: update.lastEurRate };
}

// Legacy alias (kept for backwards compat with home.js)
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

// =====================================================
// ============ Commissions (gestores) ============
// =====================================================

export async function listManagerCommissions(year, month) {
  const demo = await isDemo();
  if (demo) {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = DEMO_SALES.filter((s) => s.createdAt >= from && s.createdAt < to && s.status === "COMPLETADA");
    return DEMO_MANAGERS.map((m) => computeManagerCommission(m, sales, year, month, {}));
  }
  const s = await sb();
  if (!s) return [];
  try {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = await listSales({ from, to });
    const completed = sales.filter((s) => s.status === "COMPLETADA");
    const managers = await listManagers();
    // Fetch payouts
    const { data: payoutsData } = await s.from("commission_payouts")
      .select("*")
      .eq("year", year)
      .eq("month", month);
    const payouts = new Map((payoutsData || []).map((p) => [p.manager_id, p]));

    return managers.map((m) => {
      const managerSales = completed.filter((s) => s.managerId === m.id);
      const result = computeManagerCommission(m, managerSales, year, month, payouts);
      const payout = payouts.get(m.id);
      return {
        ...result,
        paid: !!payout,
        paidAt: payout ? isoToMs(payout.paid_at) : null,
      };
    });
  } catch { return []; }
}

function computeManagerCommission(m, sales, year, month, payouts) {
  let amountUSD = 0;
  let amountMN = 0;
  let totalUnits = 0;
  let totalSales = 0;
  for (const s of sales) {
    totalSales += s.totalAmount;
    for (const item of s.items) {
      totalUnits += item.quantity;
      const gCom = item.gestorCommission ?? item.commission ?? 0;
      const gCurr = item.gestorCommissionCurrency ?? item.commissionCurrency ?? "USD";
      if (gCurr === "USD") amountUSD += gCom * item.quantity;
      else amountMN += gCom * item.quantity;
    }
  }
  return {
    id: `${m.id}_${year}_${month}`,
    managerId: m.id,
    name: m.name,
    code: m.code,
    phone: m.phone,
    commission: m.commission,
    salesCount: sales.length,
    totalUnits,
    totalSales,
    amountUSD,
    amountMN,
    amount: amountUSD + amountMN * (getStore().getState().rates["MN"]?.rateUSD || (1/320)),
  };
}

export async function markManagerCommissionPaid(managerId, year, month, paid, paidBy = null) {
  const s = await sb();
  if (!s) return;
  const id = `${managerId}_${year}_${month}`;
  try {
    if (paid) {
      const r = toRow({ id, managerId, year, month, paidAt: Date.now(), paidBy });
      const { error } = await s.from("commission_payouts").upsert(r, { onConflict: "id" });
      if (error) throw error;
    } else {
      const { error } = await s.from("commission_payouts").delete().eq("id", id);
      if (error && error.code !== "PGRST116") throw error;
    }
  } catch (err) {
    console.error("markManagerCommissionPaid failed:", err);
  }
}

// =====================================================
// ============ Commissions (vendedores locales) ============
// =====================================================

export async function listWarehouseCommissions(year, month) {
  const demo = await isDemo();
  if (demo) {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = DEMO_SALES.filter((s) => s.createdAt >= from && s.createdAt < to && s.status === "COMPLETADA");
    return DEMO_WAREHOUSES.map((w) => computeWarehouseCommission(w, sales, year, month));
  }
  const s = await sb();
  if (!s) return [];
  try {
    const from = new Date(year, month - 1, 1).getTime();
    const to = new Date(year, month, 1).getTime();
    const sales = await listSales({ from, to });
    const completed = sales.filter((s) => s.status === "COMPLETADA");
    const warehouses = await listWarehouses();
    return warehouses.map((w) => computeWarehouseCommission(w, completed.filter((s) => s.warehouseId === w.id), year, month));
  } catch { return []; }
}

function computeWarehouseCommission(w, sales, year, month) {
  const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const amount = totalSales * (w.sellerCommissionPercent || 0) / 100;
  return {
    id: `${w.id}_${year}_${month}`,
    warehouseId: w.id,
    warehouseName: w.name,
    warehouseCode: w.code,
    sellerId: null,
    sellerName: null,
    salesCount: sales.length,
    totalSales,
    commissionPercent: w.sellerCommissionPercent || 0,
    commissionCurrency: w.sellerCommissionCurrency || "USD",
    amountUSD: (w.sellerCommissionCurrency || "USD") === "USD" ? amount : 0,
    amountMN: (w.sellerCommissionCurrency || "USD") === "MN" ? amount : 0,
    amount,
  };
}

// =====================================================
// ============ Transfers ============
// =====================================================

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

// =====================================================
// ============ Warehouse summary (IMPLEMENTED — was TODO) ============
// =====================================================

export async function getWarehouseSummary(warehouseId, period = "today") {
  const demo = await isDemo();
  if (demo) {
    return await getWarehouseSummaryDemo(warehouseId, period);
  }
  const s = await sb();
  if (!s) return null;
  try {
    const now = new Date();
    let from;
    if (period === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === "week") {
      from = now.getTime() - 7 * 86400000;
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    // Fetch sales, stock, warehouse in parallel
    const [salesRes, stockRes, whRes, productsRes] = await Promise.all([
      s.from("sales").select("*").eq("warehouse_id", warehouseId).gte("created_at", new Date(from).toISOString()),
      s.from("stock").select("*").eq("warehouse_id", warehouseId),
      s.from("warehouses").select("*").eq("id", warehouseId).maybeSingle(),
      s.from("products").select("*"),
    ]);

    const sales = rows(salesRes.data || []);
    const stock = rows(stockRes.data || []);
    const warehouse = whRes.data ? row(whRes.data) : null;
    const products = rows(productsRes.data || []);
    const productsById = new Map(products.map((p) => [p.id, p]));

    const completed = sales.filter((s) => s.status === "COMPLETADA");
    const byCurrency = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
    for (const s of completed) {
      if (s.currency && byCurrency[s.currency] !== undefined) byCurrency[s.currency] += s.totalAmount;
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
          const product = productsById.get(s.productId);
          return sum + (s.quantity * (s.localPrice || product?.salePrice || 0));
        }, 0),
        totalSkus: stock.length,
        lowStockCount: stock.filter((s) => s.quantity <= (s.minStock || 5)).length,
        outOfStockCount: stock.filter((s) => s.quantity === 0).length,
        products: stock.map((s) => {
          const product = productsById.get(s.productId);
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
  } catch (err) {
    console.error("getWarehouseSummary failed:", err);
    return null;
  }
}

async function getWarehouseSummaryDemo(warehouseId, period) {
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
    if (s.currency) byCurrency[s.currency] = (byCurrency[s.currency] || 0) + s.totalAmount;
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

// =====================================================
// ============ Warehouse history (IMPLEMENTED — was TODO) ============
// =====================================================

export async function getWarehouseHistory(warehouseId, status = "all") {
  const demo = await isDemo();
  if (demo) {
    return await getWarehouseHistoryDemo(warehouseId, status);
  }
  const s = await sb();
  if (!s) return null;
  try {
    let query = s.from("sales").select("*").eq("warehouse_id", warehouseId).order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    let sales = rows(data);
    if (status !== "all") sales = sales.filter((s) => s.status === status);

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

    const wh = await s.from("warehouses").select("*").eq("id", warehouseId).maybeSingle();
    return {
      warehouse: wh.data ? row(wh.data) : null,
      summary,
      days: Object.values(days).sort((a, b) => b.date.localeCompare(a.date)),
      generatedAt: Date.now(),
    };
  } catch (err) {
    console.error("getWarehouseHistory failed:", err);
    return null;
  }
}

async function getWarehouseHistoryDemo(warehouseId, status) {
  let sales = DEMO_SALES.filter((s) => s.warehouseId === warehouseId);
  if (status !== "all") sales = sales.filter((s) => s.status === status);
  sales.sort((a, b) => b.createdAt - a.createdAt);
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

// =====================================================
// ============ Managers (gestores) ============
// =====================================================

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
  const s = await sb();
  if (!s) return [];
  try {
    const { data, error } = await s.from("managers").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch { return []; }
}

export async function saveManager(m) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const r = toRow({ ...m, code: (m.code || "").toUpperCase(), createdAt: m.createdAt || Date.now() });
    if (m.id) {
      const { error } = await s.from("managers").update(r).eq("id", m.id);
      if (error) throw error;
      return m.id;
    }
    const { data, error } = await s.from("managers").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveManager failed:", err);
    return "demo-id";
  }
}

export async function deleteManager(id) {
  const s = await sb();
  if (!s) return;
  try {
    const { error } = await s.from("managers").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteManager failed:", err);
  }
}

// =====================================================
// ============ Cards (tarjetas) ============
// =====================================================

export async function listCards() {
  const demo = await isDemo();
  if (demo) return DEMO_CARDS;
  const s = await sb();
  if (!s) return [];
  try {
    const { data, error } = await s.from("cards").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch { return []; }
}

export async function saveCard(c) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const r = toRow({ ...c, createdAt: c.createdAt || Date.now() });
    if (c.id) {
      const { error } = await s.from("cards").update(r).eq("id", c.id);
      if (error) throw error;
      return c.id;
    }
    const { data, error } = await s.from("cards").insert(r).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error("saveCard failed:", err);
    return "demo-id";
  }
}

export async function deleteCard(id) {
  const s = await sb();
  if (!s) return;
  try {
    // Soft-delete (matches Firestore behavior)
    const { error } = await s.from("cards").update({ active: false }).eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteCard failed:", err);
  }
}

// =====================================================
// Re-export isSupabaseConfigured for app.js
// =====================================================
export { isSupabaseConfiguredAsync } from "./supabase.js";

// =====================================================
// Wholesale helpers — cálculo de tier aplicable
// =====================================================

/**
 * Dado un producto con wholesaleTiers y una cantidad de cajas,
 * devuelve el tier aplicable (o null si no hay tiers configurados).
 */
export function getWholesaleTier(product, boxes) {
  if (!product?.wholesaleTiers || !Array.isArray(product.wholesaleTiers) || product.wholesaleTiers.length === 0) {
    return null;
  }
  const tiers = [...product.wholesaleTiers].sort((a, b) => (a.minBoxes || 0) - (b.minBoxes || 0));
  for (const tier of tiers) {
    const min = tier.minBoxes || 0;
    const max = tier.maxBoxes; // null = sin límite
    if (boxes >= min && (max === null || max === undefined || boxes <= max)) {
      return tier;
    }
  }
  // Si ninguna tier encaja (ej: boxes < min del primer tier), usar la primera
  return tiers[0];
}

/**
 * Calcula el precio sugerido por caja para una cantidad dada.
 * Retorna null si el producto no tiene unitsPerBox o no tiene tiers.
 */
export function getSuggestedPricePerBox(product, boxes) {
  if (!product?.unitsPerBox) return null;
  const tier = getWholesaleTier(product, boxes);
  if (!tier) return null;
  return (tier.pricePerUnit || 0) * product.unitsPerBox;
}

/**
 * Calcula la comisión sugerida del vendedor por caja.
 */
export function getSuggestedVendorCommissionPerBox(product, boxes) {
  if (!product?.unitsPerBox) return null;
  const tier = getWholesaleTier(product, boxes);
  if (!tier) return null;
  return (tier.vendorCommission || 0) * product.unitsPerBox;
}

/**
 * Calcula la comisión sugerida del gestor por caja.
 */
export function getSuggestedGestorCommissionPerBox(product, boxes) {
  if (!product?.unitsPerBox) return null;
  const tier = getWholesaleTier(product, boxes);
  if (!tier) return null;
  return (tier.gestorCommission || 0) * product.unitsPerBox;
}

/**
 * Verifica si un producto puede venderse al por mayor.
 */
export function isWholesaleProduct(product) {
  return !!(product?.unitsPerBox && product?.wholesaleTiers?.length > 0);
}

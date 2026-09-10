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
//
// JSDoc typedefs for the data model
/**
 * @typedef {Object} Warehouse
 * @property {string} id - UUID
 * @property {string} name
 * @property {string} code
 * @property {string} [address]
 * @property {string} [phone]
 * @property {boolean} active
 * @property {string} [pin] - 4-8 digit numeric
 * @property {number} sellerCommissionPercent
 * @property {"USD"|"MN"} sellerCommissionCurrency
 * @property {number} createdAt
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} authUid
 * @property {string} username
 * @property {string} displayName
 * @property {string} email
 * @property {"admin"|"gestor"|"vendedor"|"warehouse"|"empleado_pin"} role
 * @property {boolean} active
 * @property {string} [warehouseId]
 * @property {string[]} [warehouseIds]
 * @property {string} [warehouseName]
 * @property {string} [warehouseCode]
 * @property {number} [commissionRate]
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} brand
 * @property {string} [sku]
 * @property {string} [viscosity]
 * @property {number} [volumeLiters]
 * @property {string} [categoryId]
 * @property {string} [categoryName]
 * @property {string} [subcategoryId]
 * @property {string} [description]
 * @property {number} costPrice
 * @property {number} salePrice
 * @property {number} minStock
 * @property {number} gestorCommission
 * @property {"USD"|"MN"} gestorCommissionCurrency
 * @property {number} vendorCommission
 * @property {"USD"|"MN"} vendorCommissionCurrency
 * @property {string} [imageUrl]
 * @property {boolean} active
 * @property {number} [unitsPerBox]
 * @property {Array<{minBoxes:number,maxBoxes:?number,pricePerUnit:number,vendorCommission:number,gestorCommission:number}>} [wholesaleTiers]
 */

/**
 * @typedef {Object} SaleItem
 * @property {string} productId
 * @property {string} [name]
 * @property {string} [productName]
 * @property {string} [brand]
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} subtotal
 * @property {boolean} [isWholesale]
 * @property {number} [boxes]
 * @property {number} [pricePerBox]
 * @property {number} [vendorCommissionPerBox]
 * @property {number} [gestorCommissionPerBox]
 * @property {number} [gestorCommission]
 * @property {"USD"|"MN"} [gestorCommissionCurrency]
 * @property {number} [vendorCommission]
 * @property {"USD"|"MN"} [vendorCommissionCurrency]
 */

/**
 * @typedef {Object} Sale
 * @property {string} id
 * @property {string} code
 * @property {string} [clientRef] - UUID for idempotency
 * @property {string} warehouseId
 * @property {string} warehouseName
 * @property {string} warehouseCode
 * @property {string} userId
 * @property {string} userName
 * @property {string} [managerId]
 * @property {string} [managerName]
 * @property {string} [managerCode]
 * @property {string} [customerName]
 * @property {SaleItem[]} items
 * @property {number} totalAmount
 * @property {number} totalUsd
 * @property {Array<{currency:string,amount:number,amountUSD:number,exchangeRate:number}>} payments
 * @property {boolean} isMultiCurrency
 * @property {"SINGLE"|"MULTI"} paymentMode
 * @property {"USD"|"MN"|"EUR"|"TRANSFERENCIA"} currency
 * @property {number} paidUsd
 * @property {number} paidMn
 * @property {number} paidEur
 * @property {number} paidTransfer
 * @property {"EFECTIVO"|"TRANSFERENCIA"} [paymentMethod]
 * @property {string} [cardId]
 * @property {string} [cardNumber]
 * @property {string} [cardName]
 * @property {number} [transferAmount]
 * @property {string} [note]
 * @property {"PENDIENTE"|"COMPLETADA"|"CANCELADA"} status
 * @property {number} [completedAt]
 * @property {number} [cancelledAt]
 * @property {string} [cancelReason]
 * @property {number} gestorCommissionUsd
 * @property {number} gestorCommissionMn
 * @property {number} vendorCommissionUsd
 * @property {number} vendorCommissionMn
 * @property {"RETAIL"|"WHOLESALE"} saleType
 * @property {number} [boxes]
 * @property {number} [pricePerBox]
 * @property {number} [vendorCommissionPerBox]
 * @property {number} [gestorCommissionPerBox]
 * @property {number} createdAt
 * @property {number} [syncedAt]
 */

/**
 * @typedef {Object} StockMovement
 * @property {string} id
 * @property {string} warehouseId
 * @property {string} productId
 * @property {string} [productName]
 * @property {number} delta
 * @property {"AJUSTE_MANUAL"|"INVENTARIO"|"MERMA"|"DEVOLUCION"|"VENTA"|"CANCELACION"|"REABRIR"} reason
 * @property {string} [note]
 * @property {string} [userId]
 * @property {string} [userName]
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Stock
 * @property {string} id - composite: `${warehouseId}_${productId}`
 * @property {string} warehouseId
 * @property {string} productId
 * @property {number} quantity
 * @property {number} [localPrice]
 * @property {number} minStock
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} name
 * @property {string} number
 * @property {"BPA"|"BANDEC"|"BANMET"} [bank]
 * @property {boolean} active
 */

/**
 * @typedef {Object} Manager
 * @property {string} id
 * @property {string} name
 * @property {string} code - 2-3 char sigla
 * @property {string} [phone]
 * @property {string} [email]
 * @property {number} commission
 * @property {boolean} active
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} color
 * @property {string} [icon]
 * @property {string} [parentId]
 * @property {number} sortOrder
 * @property {boolean} active
 */

/**
 * @typedef {Object} Rate
 * @property {string} id - currency code
 * @property {"USD"|"MN"|"EUR"|"TRANSFERENCIA"} currency
 * @property {number} rateUSD
 * @property {"manual"|"api"} source
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} Settings
 * @property {string} pinCode - 4-6 digit numeric
 * @property {boolean} elToqueEnabled
 * @property {number} elToqueMarkup
 * @property {string} businessName
 * @property {number} [lastRateSync]
 */

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
  // Configuración de fin de semana
  weekendRedirectEnabled: false,    // Si true, las ventas de sábados y domingos se reasignan
  weekendWarehouseId: null,        // Almacén que recibe las ventas de fin de semana (ej: Vedado)
  weekendWarehouseName: null,       // Cache denormalizado para mostrar en UI
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

/**
 * Get the singleton settings row.
 * @returns {Promise<Settings>}
 */
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

/**
 * Save settings (singleton, id='global').
 * @param {Partial<Settings>} settings
 * @returns {Promise<void>}
 */
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
// Weekend warehouse redirect helper
// =====================================================
// Regla: si hoy es sábado o domingo Y el admin activó la redirección
// y configuró un almacén destino (weekendWarehouseId), todas las ventas
// se asignan a ese almacén en lugar del almacén del vendedor.
//
// Ejemplo de uso: los sábados/domingos, una vendedora distinta atiende
// el local de Vedado. Todas las ventas de fin de semana (sin importar
// qué vendedor las registra) se contabilizan para Vedado, no para el
// almacén original del vendedor.
//
// La venta conserva una auditoría: originalWarehouseId, weekendRedirect=true.

/**
 * Dado un timestamp (ms) y un almacén destino, decide si la venta debe
 * reasignarse. Devuelve null si NO se reasigna, o el objeto con los
 * campos de auditoría si se reasigna.
 *
 * @param {number} createdAtMs - timestamp de la venta (Date.now())
 * @param {object} settings - settings del store (con weekendRedirectEnabled, weekendWarehouseId)
 * @returns {null | { weekendRedirect: true, originalWarehouseId: string, weekendWarehouseId: string }}
 */
export function shouldRedirectWeekend(createdAtMs, settings) {
  if (!settings || !settings.weekendRedirectEnabled || !settings.weekendWarehouseId) {
    return null;
  }
  // getDay(): 0 = domingo, 6 = sábado
  const day = new Date(createdAtMs).getDay();
  if (day !== 0 && day !== 6) return null;
  return {
    weekendRedirect: true,
    // El original se setea después, cuando se sabe el warehouse del vendedor
    originalWarehouseId: null,
    weekendWarehouseId: settings.weekendWarehouseId,
  };
}

/**
 * Devuelve el almacén efectivo para una venta, considerando la regla de fin de semana.
 *
 * @param {object} sellerWarehouse - el almacén del vendedor ({id, name, code})
 * @param {object} allWarehouses - lista de todos los almacenes (para buscar por id)
 * @param {object} settings - settings del store
 * @param {number} createdAtMs - timestamp de la venta
 * @returns {{
 *   effective: object,        // el almacén a usar para la venta
 *   weekendRedirect: boolean, // si se reasignó
 *   originalWarehouseId: string|null,
 *   weekendWarehouseId: string|null
 * }}
 */
export function resolveEffectiveWarehouse(sellerWarehouse, allWarehouses, settings, createdAtMs) {
  const redirect = shouldRedirectWeekend(createdAtMs, settings);
  if (!redirect || !sellerWarehouse || sellerWarehouse.id === redirect.weekendWarehouseId) {
    // No aplica la regla o el vendedor ya está en el almacén de fin de semana
    return {
      effective: sellerWarehouse,
      weekendRedirect: false,
      originalWarehouseId: null,
      weekendWarehouseId: null,
    };
  }
  // Buscar el warehouse destino en la lista
  const weekendWh = allWarehouses.find((w) => w.id === redirect.weekendWarehouseId);
  if (!weekendWh) {
    // El almacén configurado no existe más — fallback al almacén del vendedor
    console.warn("[Weekend] Configured weekend warehouse not found, falling back to seller warehouse");
    return {
      effective: sellerWarehouse,
      weekendRedirect: false,
      originalWarehouseId: null,
      weekendWarehouseId: null,
    };
  }
  return {
    effective: weekendWh,
    weekendRedirect: true,
    originalWarehouseId: sellerWarehouse.id,
    weekendWarehouseId: weekendWh.id,
  };
}

// =====================================================
// ============ Warehouses ============
// =====================================================

/**
 * @returns {Promise<Warehouse[]>}
 */
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

/**
 * Subscribe to warehouse changes (realtime).
 * @param {(warehouses: Warehouse[]) => void} cb
 * @returns {() => void} unsubscribe
 */
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

/**
 * @param {Partial<Warehouse>} w
 * @returns {Promise<string>} warehouse id
 */
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

/**
 * Crea o actualiza un almacén Y carga el stock inicial de varios productos.
 * Si es un almacén nuevo: inserta + ajusta stock de cada producto a la cantidad dada.
 * Si es un almacén existente: actualiza + ajusta solo los productos que cambiaron.
 *
 * @param {Object} warehouse - datos del almacén (igual que saveWarehouse)
 * @param {Array<{productId, quantity, localPrice?}>} stockItems - stock inicial por producto
 *   - Si quantity > 0 y el producto no tiene stock en ese almacén → ajusta a ese valor (INVENTARIO inicial)
 *   - Si quantity = 0 → no hace nada (omite el producto)
 *   - Si es edición y el producto ya tiene stock → no se modifica (salvo que se cambie el quantity)
 * @returns {Promise<string>} - id del almacén
 */
export async function saveWarehouseWithStock(warehouse, stockItems = []) {
  // 1) Guardar el almacén (crear o actualizar)
  const warehouseId = await saveWarehouse(warehouse);
  if (!warehouseId || warehouseId === "demo-id") return warehouseId;

  // 2) Para cada producto con stock inicial, ajustar el stock
  const s = await sb();
  if (!s) return warehouseId;

  // 3) Si es edición, obtener el stock actual del almacén para no sobreescribir
  let existingStockMap = new Map();
  if (warehouse.id) {
    try {
      const { data, error } = await s.from("stock").select("*").eq("warehouse_id", warehouseId);
      if (!error && data) {
        for (const row of data) {
          existingStockMap.set(row.product_id, Number(row.quantity) || 0);
        }
      }
    } catch (err) {
      console.warn("[saveWarehouseWithStock] No se pudo cargar stock existente:", err);
    }
  }

  // 4) Ajustar cada producto
  for (const item of stockItems) {
    if (!item.productId || !item.quantity || item.quantity < 0) continue;
    const existingQty = existingStockMap.get(item.productId) || 0;
    if (warehouse.id && existingQty === item.quantity) continue; // no cambió, omitir

    // Calcular delta: si es nuevo o el producto no estaba, delta = quantity total
    // Si existía, delta = diferencia (nuevo - actual)
    const delta = warehouse.id ? (item.quantity - existingQty) : item.quantity;
    if (delta === 0) continue;

    try {
      // Usar adjustStock que inserta/atualiza stock + registra el movimiento
      await adjustStock(
        warehouseId,
        item.productId,
        delta,
        "INVENTARIO",
        `Stock inicial — ${warehouse.name || 'almacén'}`,
        warehouse._createdBy?.id,
        warehouse._createdBy?.displayName
      );

      // Si viene localPrice, actualizarlo (adjustStock no lo maneja)
      if (item.localPrice != null) {
        const stockId = `${warehouseId}_${item.productId}`;
        await s.from("stock").update({
          local_price: item.localPrice,
          updated_at: new Date().toISOString(),
        }).eq("id", stockId);
      }
    } catch (err) {
      console.error(`[saveWarehouseWithStock] Error ajustando ${item.productId}:`, err);
    }
  }

  return warehouseId;
}

/**
 * @param {string} id - warehouse id
 * @returns {Promise<void>}
 */
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

/**
 * @returns {Promise<User[]>}
 */
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

/**
 * @param {string} email
 * @returns {Promise<User|null>}
 */
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

/**
 * Save a user. If `u.id` is set, updates; otherwise creates.
 * If `u.password` is set, creates auth.users via RPC.
 * @param {Partial<User> & {password?: string}} u
 * @returns {Promise<string>} user id
 */
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

/**
 * Soft-delete a user (deactivates profile + bans auth user).
 * @param {string} id - user id
 * @returns {Promise<void>}
 */
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

/**
 * Subscribe to product changes.
 * @param {(products: Product[]) => void} cb
 * @returns {() => void} unsubscribe
 */
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

// Columnas reales de la tabla `products` (schema.sql). Cualquier campo extra
// que envíe la UI se descarta aquí para evitar el error PGRST204
// ("Could not find the 'X' column of 'products' in the schema cache"),
// que antes dejaba el guardado colgado sin guardar ni avisar.
const PRODUCT_COLUMNS = new Set([
  "id", "name", "brand", "sku", "viscosity", "volume_liters",
  "category_id", "category_name", "subcategory_id", "description",
  "cost_price", "sale_price", "min_stock",
  "gestor_commission", "gestor_commission_currency",
  "vendor_commission", "vendor_commission_currency",
  "image_url", "active", "units_per_box", "wholesale_tiers", "created_at",
]);

function sanitizeProductRow(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (PRODUCT_COLUMNS.has(k)) out[k] = v;
  }
  // `brand` es NOT NULL en la BD — el catálogo antiguo no lo pedía
  if (!out.brand || String(out.brand).trim() === "") out.brand = "MANNOL";
  if (!out.name || String(out.name).trim() === "") {
    throw new Error("El nombre del producto es obligatorio");
  }
  return out;
}

/**
 * Save a product. Replaces old image in storage if URL changes.
 * Lanza el error real (no lo traga) para que la UI pueda mostrarlo.
 * @param {Partial<Product>} p
 * @returns {Promise<string>} product id
 */
export async function saveProduct(p) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    // Detectar imagen reemplazada para borrar la huérfana
    if (p.id && p.imageUrl) {
      try {
        const { data: existing } = await s.from("products").select("image_url").eq("id", p.id).maybeSingle();
        if (existing?.image_url && existing.image_url !== p.imageUrl) {
          await deleteStorageImageByUrl(s, existing.image_url);
        }
      } catch (cleanupErr) {
        console.warn("[saveProduct] image cleanup check failed:", cleanupErr);
      }
    }

    const r = sanitizeProductRow(toRow({ ...p, createdAt: p.createdAt || Date.now() }));
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
    // Propagar el error real (RLS, columna inválida, red, etc.) para que
    // el usuario lo vea en pantalla en vez de un guardado infinito.
    throw new Error(err.message || "No se pudo guardar el producto");
  }
}

/**
 * Delete a product and its image in storage.
 * @param {string} id - product id
 * @returns {Promise<void>}
 */
export async function deleteProduct(id) {
  const s = await sb();
  if (!s) return;
  try {
    // 1. Obtener la imagen antes de borrar el producto, para limpiar storage
    try {
      const { data: existing } = await s.from("products").select("image_url").eq("id", id).maybeSingle();
      if (existing?.image_url) {
        await deleteStorageImageByUrl(s, existing.image_url);
      }
    } catch (cleanupErr) {
      console.warn("[deleteProduct] image cleanup check failed:", cleanupErr);
    }

    // 2. Borrar el producto (cascada borra stock, sales, etc.)
    const { error } = await s.from("products").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("deleteProduct failed:", err);
  }
}

/**
 * Borra una imagen del bucket `products` de Supabase Storage a partir de su URL pública.
 * Solo borra URLs del propio Supabase (no URLs externas).
 * Si la RLS bloquea (no admin), ignora silenciosamente.
 */
async function deleteStorageImageByUrl(s, imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return;

  // Imágenes en GitHub (raw.githubusercontent / jsDelivr) — best-effort
  if (imageUrl.includes("githubusercontent.com") || imageUrl.includes("cdn.jsdelivr.net/gh/")) {
    try {
      const { deleteImageFromGitHub } = await import("./github-storage.js");
      const ok = await deleteImageFromGitHub(imageUrl);
      if (ok) console.info("[deleteStorageImage] Removed from GitHub:", imageUrl);
    } catch (err) {
      console.warn("[deleteStorageImage] GitHub delete failed:", err?.message || err);
    }
    return;
  }

  if (!imageUrl.includes("/storage/v1/object/")) return; // URL externa, ignorar
  if (!imageUrl.includes("/products/")) return; // no es del bucket products, ignorar

  try {
    // Extraer el path del archivo (después de "/products/")
    const marker = "/products/";
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return;
    const filePath = imageUrl.substring(idx + marker.length).split("?")[0]; // quitar query string
    if (!filePath) return;

    const { error } = await s.storage.from("products").remove([filePath]);
    if (error) {
      // Si la RLS bloquea (no admin), no es fatal
      if (error.message?.includes("permission") || error.statusCode === "403") {
        console.warn("[deleteStorageImage] RLS blocked — admin needs to delete manually:", filePath);
        return;
      }
      throw error;
    }
    console.info(`[deleteStorageImage] Removed ${filePath}`);
  } catch (err) {
    console.warn(`[deleteStorageImage] Failed to remove image: ${err.message}`);
  }
}

/**
 * @returns {Promise<Product[]>}
 */
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

/**
 * @returns {Promise<Category[]>}
 */
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

/**
 * Build composite stock doc id.
 * @param {string} warehouseId
 * @param {string} productId
 * @returns {string} `${warehouseId}_${productId}`
 */
export function stockDocId(warehouseId, productId) {
  return `${warehouseId}_${productId}`;
}

/**
 * Subscribe to stock changes for a warehouse.
 * @param {string} warehouseId
 * @param {(stock: Stock[]) => void} cb
 * @returns {() => void} unsubscribe
 */
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

/**
 * Set stock directly (upsert).
 * @param {string} warehouseId
 * @param {string} productId
 * @param {number} quantity
 * @param {number} [minStock=0]
 * @returns {Promise<void>}
 */
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

/**
 * Adjust stock atomically via RPC (with audit trail).
 * @param {string} warehouseId
 * @param {string} productId
 * @param {number} delta - can be positive or negative
 * @param {"AJUSTE_MANUAL"|"INVENTARIO"|"MERMA"|"DEVOLUCION"|"VENTA"|"CANCELACION"|"REABRIR"} reason
 * @param {string} [note]
 * @param {string} [userId]
 * @param {string} [userName]
 * @returns {Promise<void>}
 */
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

/**
 * @param {string} [warehouseId] - optional filter
 * @returns {Promise<Stock[]>}
 */
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

/**
 * @param {{warehouseId?: string, productId?: string, limit?: number}} [filters]
 * @returns {Promise<StockMovement[]>}
 */
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

/**
 * Subscribe to sales changes.
 * @param {(sales: Sale[]) => void} cb
 * @param {{warehouseId?: string, userId?: string, managerId?: string, from?: number, to?: number, status?: string}} [filters]
 * @returns {() => void} unsubscribe
 */
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

/**
 * @param {{warehouseId?: string, userId?: string, managerId?: string, from?: number, to?: number, status?: string}} [filters]
 * @returns {Promise<Sale[]>}
 */
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

/**
 * Save a sale (idempotent via clientRef unique constraint).
 * @param {Sale} sale
 * @returns {Promise<void>}
 */
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
    // Hook: si la venta es con TRANSFERENCIA a una tarjeta, registrar el movimiento
    // de tarjeta (saldo). Es non-blocking: si falla, la venta ya está guardada.
    try {
      await recordCardMovementForSale(sale);
    } catch (e) {
      console.warn("[saveSale] recordCardMovementForSale failed (non-blocking):", e);
    }
  } catch (err) {
    console.error("saveSale failed:", err);
    throw err;
  }
}

/**
 * Change sale status atomically (handles stock deduction/restoration via RPC).
 * @param {string} saleId
 * @param {"PENDIENTE"|"COMPLETADA"|"CANCELADA"} newStatus
 * @param {string} [reason] - required for CANCELADA
 * @param {string} [userId]
 * @param {string} [userName]
 * @returns {Promise<void>}
 */
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

/**
 * @param {string} saleId
 * @param {string} reason
 * @returns {Promise<void>}
 */
export async function cancelSale(saleId, reason) {
  return await updateSaleStatus(saleId, "CANCELADA", reason);
}

// =====================================================
// ============ Rates ============
// =====================================================

/**
 * Subscribe to exchange rate changes.
 * @param {(rates: Rate[]) => void} cb
 * @returns {() => void} unsubscribe
 */
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

/**
 * @param {Partial<Rate>} rate
 * @returns {Promise<void>}
 */
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
      // Para REFERRER: solo cuenta las ventas que él refirió (managerId === m.id)
      // Para LOCAL: solo cuenta las ventas del almacén al que pertenece
      let managerSales;
      if (m.managerType === "LOCAL" && m.warehouseId) {
        managerSales = completed.filter((s) => s.warehouseId === m.warehouseId);
      } else {
        managerSales = completed.filter((s) => s.managerId === m.id);
      }
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
  // Separar ventas de fin de semana (sábado/domingo) de las de lunes-viernes
  let weekdayCount = 0;
  let weekendCount = 0;
  let weekdayAmount = 0;
  let weekendAmount = 0;

  // Filtrar ventas según el tipo de gestor:
  // - LOCAL: solo cuenta las ventas del almacén al que pertenece el gestor
  // - REFERRER: cuenta las ventas que él refirió (managerId === m.id) en cualquier almacén
  let managerSales = sales;
  if (m.managerType === "LOCAL" && m.warehouseId) {
    managerSales = sales.filter((s) => s.warehouseId === m.warehouseId);
  }
  // Si es REFERRER, el filtro ya se aplicó arriba (managerId === m.id)

  const commissionType = m.commissionType || "PERCENT";
  const commissionCurrency = m.commissionCurrency || "USD";
  const commissionValue = Number(m.commission) || 0;

  for (const s of managerSales) {
    totalSales += s.totalAmount;

    // Determinar si la venta fue en fin de semana (sábado=6 o domingo=0)
    // dayOfWeek puede venir del campo guardado, o se calcula de createdAt
    const dow = s.dayOfWeek !== undefined && s.dayOfWeek !== null
      ? s.dayOfWeek
      : new Date(s.createdAt).getDay();
    const isWeekend = (dow === 0 || dow === 6);
    if (isWeekend) {
      weekendCount++;
      weekendAmount += s.totalAmount;
    } else {
      weekdayCount++;
      weekdayAmount += s.totalAmount;
    }

    // Calcular comisión según tipo
    let commissionForThisSale = 0;
    if (commissionType === "PERCENT") {
      // Porcentaje del total de la venta
      commissionForThisSale = (s.totalAmount * commissionValue) / 100;
    } else {
      // FIXED: valor fijo por venta
      commissionForThisSale = commissionValue;
    }
    // Sumar unidades
    for (const item of s.items) {
      totalUnits += item.quantity;
    }
    // Acumular en la moneda configurada
    if (commissionCurrency === "USD") {
      amountUSD += commissionForThisSale;
    } else {
      amountMN += commissionForThisSale;
    }
  }

  return {
    id: `${m.id}_${year}_${month}`,
    managerId: m.id,
    name: m.name,
    code: m.code,
    phone: m.phone,
    commission: commissionValue,
    commissionType,
    commissionCurrency,
    managerType: m.managerType || "REFERRER",
    warehouseId: m.warehouseId || null,
    warehouseName: m.warehouseName || null,
    warehouseCode: m.warehouseCode || null,
    salesCount: managerSales.length,
    totalUnits,
    totalSales,
    amountUSD,
    amountMN,
    amount: amountUSD + amountMN * (getStore().getState().rates["MN"]?.rateUSD || (1/320)),
    // Separación sábado/domingo vs lunes-viernes (para el reporte de comisiones)
    weekdayCount,
    weekendCount,
    weekdayAmount,
    weekendAmount,
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

/**
 * Verifica si hay comisiones NO PAGADAS del mes anterior al actual.
 * Devuelve un objeto con el resumen para mostrar como recordatorio en el dashboard.
 *
 * @returns {Promise<{hasUnpaid: boolean, month: number, year: number, monthLabel: string, gestores: number, totalUSD: number, totalMN: number}>}
 */
export async function getUnpaidCommissionsFromPreviousMonth() {
  const now = new Date();
  // Mes anterior
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthLabel = new Date(prevYear, prevMonth, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  try {
    const commissions = await listManagerCommissions(prevYear, prevMonth + 1);
    const unpaid = commissions.filter((c) => !c.paid);
    if (unpaid.length === 0) {
      return { hasUnpaid: false, month: prevMonth + 1, year: prevYear, monthLabel, gestores: 0, totalUSD: 0, totalMN: 0 };
    }
    const totalUSD = unpaid.reduce((s, c) => s + (c.amountUSD || 0), 0);
    const totalMN = unpaid.reduce((s, c) => s + (c.amountMN || 0), 0);
    return {
      hasUnpaid: true,
      month: prevMonth + 1,
      year: prevYear,
      monthLabel,
      gestores: unpaid.length,
      totalUSD,
      totalMN,
    };
  } catch (err) {
    console.error("getUnpaidCommissionsFromPreviousMonth failed:", err);
    return { hasUnpaid: false, month: prevMonth + 1, year: prevYear, monthLabel, gestores: 0, totalUSD: 0, totalMN: 0 };
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
      // Defaults para demo (assume REFERRER + PERCENT)
      const managerType = m.managerType || "REFERRER";
      const commissionType = m.commissionType || "PERCENT";
      const commissionCurrency = m.commissionCurrency || "USD";
      let comisionEstimada = 0;
      if (commissionType === "PERCENT") {
        comisionEstimada = montoTotal * (m.commission || 0) / 100;
      } else {
        comisionEstimada = (m.commission || 0) * completadas.length;
      }
      return {
        ...m,
        managerType,
        commissionType,
        commissionCurrency,
        warehouseId: m.warehouseId || null,
        warehouseName: m.warehouseName || null,
        warehouseCode: m.warehouseCode || null,
        totalReferidos: sales.length,
        completadas: completadas.length,
        pendientes: pendientes.length,
        canceladas: canceladas.length,
        montoTotal,
        comisionEstimada,
      };
    });
  }
  const s = await sb();
  if (!s) return [];
  try {
    // Select managers + join warehouses para LOCAL
    const { data, error } = await s
      .from("managers")
      .select(`
        *,
        warehouse:warehouse_id ( id, name, code )
      `)
      .order("created_at", { ascending: true });
    if (error) throw error;
    // Aplanar el join
    return (data || []).map((row) => {
      const r = rows([row])[0];
      // El join retorna warehouse como objeto o null
      const wh = row.warehouse;
      return {
        ...r,
        managerType: r.managerType || "REFERRER",
        commissionType: r.commissionType || "PERCENT",
        commissionCurrency: r.commissionCurrency || "USD",
        warehouseId: r.warehouseId || null,
        warehouseName: wh?.name || null,
        warehouseCode: wh?.code || null,
      };
    });
  } catch (err) {
    console.error("listManagers failed:", err);
    return [];
  }
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
// ============ Card balances + movements ============
// =====================================================
// El saldo actual de una tarjeta se calcula así:
//   saldo = initial_balance + SUM(card_movements.amount)
// donde cada movimiento.amount es positivo (depósito/venta)
// o negativo (retiro/ajuste).

/**
 * Calcula el saldo actual de una tarjeta, considerando:
 * - initial_balance (saldo inicial configurado)
 * - movimientos manuales (DEPOSIT, WITHDRAW, ADJUST)
 * - ventas con TRANSFERENCIA a esa tarjeta (movimientos SALE)
 *
 * @param {string} cardId
 * @returns {Promise<{balance: number, currency: string, movements: Array, salesCount: number}>}
 */
export async function getCardBalance(cardId) {
  const s = await sb();
  if (!s) {
    // Modo demo
    return { balance: 0, currency: "USD", movements: [], salesCount: 0 };
  }
  try {
    // 1) Obtener la tarjeta (initial_balance + currency)
    const { data: card, error: cardErr } = await s.from("cards")
      .select("initial_balance, balance_currency")
      .eq("id", cardId)
      .maybeSingle();
    if (cardErr) throw cardErr;
    if (!card) return { balance: 0, currency: "USD", movements: [], salesCount: 0 };

    // 2) Obtener movimientos
    const { data: movements, error: mvErr } = await s.from("card_movements")
      .select("*")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false });
    if (mvErr) throw mvErr;

    // 3) Calcular saldo
    const initial = Number(card.initial_balance) || 0;
    const movementsSum = (movements || []).reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    const balance = initial + movementsSum;
    const salesCount = (movements || []).filter((m) => m.movement_type === "SALE").length;

    return {
      balance,
      currency: card.balance_currency || "USD",
      movements: rows(movements || []),
      salesCount,
    };
  } catch (err) {
    console.error("getCardBalance failed:", err);
    return { balance: 0, currency: "USD", movements: [], salesCount: 0 };
  }
}

/**
 * Obtiene el saldo de TODAS las tarjetas en una sola consulta.
 * Más eficiente que llamar a getCardBalance para cada una.
 *
 * @returns {Promise<Array<{id, name, number, bank, balance, currency, salesCount}>>}
 */
export async function listCardsWithBalances() {
  const s = await sb();
  if (!s) {
    // Modo demo: devolver cards sin balance
    return (DEMO_CARDS || []).map((c) => ({
      ...c,
      balance: 0,
      currency: "USD",
      salesCount: 0,
      movements: [],
    }));
  }
  try {
    const { data: cards, error: cErr } = await s.from("cards")
      .select("*")
      .order("created_at", { ascending: true });
    if (cErr) throw cErr;

    const { data: movements, error: mErr } = await s.from("card_movements")
      .select("card_id, amount, movement_type");
    if (mErr) throw mErr;

    // Agrupar movimientos por card_id
    const movementsByCard = new Map();
    for (const m of movements || []) {
      if (!movementsByCard.has(m.card_id)) movementsByCard.set(m.card_id, []);
      movementsByCard.get(m.card_id).push(m);
    }

    return (cards || []).map((card) => {
      const cardMvs = movementsByCard.get(card.id) || [];
      const initial = Number(card.initial_balance) || 0;
      const sum = cardMvs.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
      const salesCount = cardMvs.filter((m) => m.movement_type === "SALE").length;
      return {
        ...rows([card])[0],
        balance: initial + sum,
        currency: card.balance_currency || "USD",
        salesCount,
      };
    });
  } catch (err) {
    console.error("listCardsWithBalances failed:", err);
    return [];
  }
}

/**
 * Agregar un movimiento manual a una tarjeta (depósito, retiro o ajuste).
 *
 * @param {Object} data - { cardId, movementType, amount, currency, note, userId, userName }
 * @returns {Promise<void>}
 */
export async function addCardMovement(data) {
  const s = await sb();
  if (!s) return;
  try {
    // amount: para DEPOSIT es positivo, para WITHDRAW negativo
    let amount = Number(data.amount) || 0;
    if (data.movementType === "WITHDRAW" && amount > 0) amount = -amount;

    const r = toRow({
      cardId: data.cardId,
      movementType: data.movementType,
      amount,
      currency: data.currency || "USD",
      note: data.note || null,
      userId: data.userId || null,
      userName: data.userName || null,
      createdAt: Date.now(),
    });
    const { error } = await s.from("card_movements").insert(r);
    if (error) throw error;
  } catch (err) {
    console.error("addCardMovement failed:", err);
    throw err;
  }
}

/**
 * Registrar automáticamente un movimiento SALE cuando se hace una venta
 * con TRANSFERENCIA a una tarjeta. Se llama desde saveSale().
 */
async function recordCardMovementForSale(sale) {
  if (!sale.cardId || sale.paymentMethod !== "TRANSFERENCIA") return;
  const amount = sale.transferAmount || sale.paidTransfer || sale.totalAmount || 0;
  if (!amount) return;
  const s = await sb();
  if (!s) return;
  try {
    const r = toRow({
      cardId: sale.cardId,
      movementType: "SALE",
      amount,  // positivo: entra dinero a la tarjeta
      currency: sale.currency === "TRANSFERENCIA" ? "USD" : sale.currency,
      note: `Venta ${sale.code}`,
      saleId: sale.id,
      userId: sale.userId,
      userName: sale.userName,
      createdAt: Date.now(),
    });
    const { error } = await s.from("card_movements").insert(r);
    if (error) throw error;
  } catch (err) {
    console.error("recordCardMovementForSale failed:", err);
  }
}

/**
 * Obtiene la evolución del saldo de una tarjeta en el tiempo.
 * Devuelve un array de puntos { label, value } listos para lineChart.
 *
 * @param {string} cardId
 * @param {number} days - cuántos días hacia atrás (default 30)
 * @returns {Promise<Array<{label: string, value: number}>>}
 */
export async function getCardBalanceHistory(cardId, days = 30) {
  const s = await sb();
  if (!s) {
    // Modo demo: devolver una línea plana en 0
    return Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return { label: d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }), value: 0 };
    });
  }
  try {
    // 1) Obtener initial_balance
    const { data: card, error: cErr } = await s.from("cards")
      .select("initial_balance, balance_currency")
      .eq("id", cardId)
      .maybeSingle();
    if (cErr) throw cErr;
    const initial = Number(card?.initial_balance) || 0;

    // 2) Obtener movimientos del período
    const fromMs = Date.now() - days * 86400000;
    const { data: movements, error: mErr } = await s.from("card_movements")
      .select("amount, created_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: true });
    if (mErr) throw mErr;

    // 3) Calcular evolución acumulada por día
    // Primero: sumar todos los movimientos ANTES del período (saldo inicial efectivo)
    const beforePeriod = (movements || [])
      .filter((m) => isoToMs(m.created_at) < fromMs)
      .reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    let runningBalance = initial + beforePeriod;

    // Movimientos dentro del período
    const inPeriod = (movements || []).filter((m) => isoToMs(m.created_at) >= fromMs);

    // Generar un punto por día
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const points = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);
      // Sumar movimientos del día
      const dayMovements = inPeriod.filter((m) => {
        const t = isoToMs(m.created_at);
        return t >= day.getTime() && t < dayEnd.getTime();
      });
      for (const m of dayMovements) {
        runningBalance += Number(m.amount) || 0;
      }
      const label = day.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      points.push({ label, value: runningBalance });
    }
    return points;
  } catch (err) {
    console.error("getCardBalanceHistory failed:", err);
    return [];
  }
}

// =====================================================
// ============ Stock availability across warehouses ============
// =====================================================
// Permite a un vendedor ver en qué otros almacenes hay stock
// de un producto que está agotado o bajo en su almacén.

/**
 * Lista el stock de un producto específico en TODOS los almacenes.
 *
 * @param {string} productId
 * @returns {Promise<Array<{warehouseId, warehouseName, warehouseCode, quantity, localPrice}>>}
 */
export async function listStockForProductInAllWarehouses(productId) {
  const s = await sb();
  if (!s) return [];
  try {
    // Join stock + warehouses
    const { data, error } = await s
      .from("stock")
      .select(`
        quantity,
        local_price,
        warehouse:warehouse_id ( id, name, code, active )
      `)
      .eq("product_id", productId);
    if (error) throw error;
    return (data || [])
      .filter((row) => row.warehouse?.active !== false)
      .map((row) => ({
        warehouseId: row.warehouse?.id,
        warehouseName: row.warehouse?.name,
        warehouseCode: row.warehouse?.code,
        quantity: Number(row.quantity) || 0,
        localPrice: row.local_price,
      }))
      .sort((a, b) => b.quantity - a.quantity);  // más stock primero
  } catch (err) {
    console.error("listStockForProductInAllWarehouses failed:", err);
    return [];
  }
}

/**
 * Lista el stock completo de TODOS los almacenes en una sola consulta.
 * Útil para mostrar "disponibilidad en otros almacenes" en el inventario.
 *
 * @returns {Promise<Array<{productId, warehouseId, warehouseName, warehouseCode, quantity, localPrice}>>}
 */
export async function listAllStockAcrossWarehouses() {
  const s = await sb();
  if (!s) return [];
  try {
    const { data, error } = await s
      .from("stock")
      .select(`
        quantity,
        local_price,
        product_id,
        warehouse:warehouse_id ( id, name, code, active )
      `);
    if (error) throw error;
    return (data || [])
      .filter((row) => row.warehouse?.active !== false)
      .map((row) => ({
        productId: row.product_id,
        warehouseId: row.warehouse?.id,
        warehouseName: row.warehouse?.name,
        warehouseCode: row.warehouse?.code,
        quantity: Number(row.quantity) || 0,
        localPrice: row.local_price,
      }));
  } catch (err) {
    console.error("listAllStockAcrossWarehouses failed:", err);
    return [];
  }
}

// =====================================================
// ============ Stock transfers (entre almacenes) ============
// =====================================================

/**
 * Crea una nueva transferencia de stock entre almacenes.
 * Estado inicial: PENDING (esperando aceptación del destino).
 *
 * @param {Object} data - { fromWarehouseId, toWarehouseId, productId, productName, quantity, note, requestedBy, requestedByName }
 * @returns {Promise<string>} - el id de la transferencia creada
 */
export async function createStockTransfer(data) {
  const s = await sb();
  if (!s) return "demo-id";
  try {
    const code = `TR-${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 9)}`;
    const r = toRow({
      code,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      productId: data.productId,
      productName: data.productName,
      quantity: data.quantity,
      status: "PENDING",
      note: data.note || null,
      requestedBy: data.requestedBy || null,
      requestedByName: data.requestedByName || null,
      createdAt: Date.now(),
    });
    const { data: inserted, error } = await s.from("stock_transfers").insert(r).select().single();
    if (error) throw error;
    return inserted.id;
  } catch (err) {
    console.error("createStockTransfer failed:", err);
    throw err;
  }
}

/**
 * Lista transferencias (filtradas por estado, almacén origen o destino).
 *
 * @param {Object} filters - { status, fromWarehouseId, toWarehouseId, productId }
 * @returns {Promise<Array>}
 */
export async function listStockTransfers(filters = {}) {
  const s = await sb();
  if (!s) return [];
  try {
    let query = s.from("stock_transfers").select("*");
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.fromWarehouseId) query = query.eq("from_warehouse_id", filters.fromWarehouseId);
    if (filters.toWarehouseId) query = query.eq("to_warehouse_id", filters.toWarehouseId);
    if (filters.productId) query = query.eq("product_id", filters.productId);
    query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return rows(data || []);
  } catch (err) {
    console.error("listStockTransfers failed:", err);
    return [];
  }
}

/**
 * Procesa una transferencia: cambia el estado y, si se confirma,
 * descuenta stock del origen y suma al destino (atómicamente).
 *
 * @param {string} transferId
 * @param {string} newStatus - "COMPLETED" | "REJECTED" | "CANCELLED"
 * @param {Object} user - { id, displayName } del que procesa
 * @returns {Promise<void>}
 */
export async function processStockTransfer(transferId, newStatus, user) {
  const s = await sb();
  if (!s) return;
  try {
    // 1) Obtener la transferencia
    const { data: transfer, error: tErr } = await s.from("stock_transfers")
      .select("*")
      .eq("id", transferId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!transfer) throw new Error("Transferencia no encontrada");
    if (transfer.status !== "PENDING") {
      throw new Error(`No se puede procesar: estado actual es ${transfer.status}`);
    }

    const t = rows([transfer])[0];

    // 2) Si se rechaza o cancela, solo actualizar estado
    if (newStatus === "REJECTED" || newStatus === "CANCELLED") {
      const { error } = await s.from("stock_transfers").update({
        status: newStatus,
        processed_by: user?.id,
        processed_by_name: user?.displayName,
        processed_at: new Date().toISOString(),
      }).eq("id", transferId);
      if (error) throw error;
      return;
    }

    // 3) Si se confirma (COMPLETED): descuenta del origen y suma al destino
    if (newStatus === "COMPLETED") {
      // Llamar a adjustStock dos veces (origen sale, destino entra)
      // Importamos las funciones dinámicamente para evitar dependencias circulares
      const { adjustStock } = await import("./db.js");

      // Descuenta del origen (cantidad negativa)
      await adjustStock(
        t.fromWarehouseId,
        t.productId,
        -t.quantity,
        "TRANSFERENCIA_SALIDA",
        `Transferencia ${t.code} → destino`,
        user?.id,
        user?.displayName
      );
      // Suma al destino (cantidad positiva)
      await adjustStock(
        t.toWarehouseId,
        t.productId,
        t.quantity,
        "TRANSFERENCIA_ENTRADA",
        `Transferencia ${t.code} ← origen`,
        user?.id,
        user?.displayName
      );

      // Marca la transferencia como COMPLETED
      const { error } = await s.from("stock_transfers").update({
        status: newStatus,
        processed_by: user?.id,
        processed_by_name: user?.displayName,
        processed_at: new Date().toISOString(),
      }).eq("id", transferId);
      if (error) throw error;
    }
  } catch (err) {
    console.error("processStockTransfer failed:", err);
    throw err;
  }
}

// =====================================================
// ============ Export all data (backup completo) ============
// =====================================================
// Devuelve todos los datos de la base de datos en un solo objeto,
// listo para exportar como CSVs separados (un archivo por apartado).

/**
 * Obtiene todos los datos de la base de datos para exportación completa.
 * Devuelve un objeto con arrays por apartado.
 *
 * @returns {Promise<Object|null>}
 */
export async function getAllDataForExport() {
  const s = await sb();
  if (!s) return null;
  try {
    // Hacer todas las consultas en paralelo para optimizar
    const tables = [
      "warehouses", "products", "categories", "subcategories", "managers",
      "cards", "users", "sales", "stock", "stock_movements",
      "card_movements", "stock_transfers", "commission_payouts",
      "settings", "rates", "rate_config",
    ];
    const results = await Promise.all(
      tables.map(async (table) => {
        try {
          const { data, error } = await s.from(table).select("*").order("created_at", { ascending: true });
          if (error) return { table, data: [], error: error.message };
          return { table, data: data || [] };
        } catch (err) {
          return { table, data: [], error: err.message };
        }
      })
    );
    // Convertir a objeto
    const out = {};
    for (const r of results) {
      // camelCase para el frontend
      const key = r.table.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = rows(r.data);
    }
    return out;
  } catch (err) {
    console.error("getAllDataForExport failed:", err);
    return null;
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

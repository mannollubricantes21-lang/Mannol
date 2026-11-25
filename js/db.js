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
import { validateTransferRequest, canTransitionRequest } from "./sales-stats.js";
import {
  DEMO_WAREHOUSES, DEMO_MANAGERS, DEMO_CARDS, DEMO_CATEGORIES, DEMO_BRANDS,
  DEMO_PRODUCTS, DEMO_STOCK, DEMO_SALES, DEMO_RATE_CONFIG, DEMO_TODAY_RATES,
} from "./demo-data.js";
import { slugify, normalizeKey } from "./catalog-facets.js";
import { readQueue, subscribeQueue, mergePendingSales, applyPendingToStock } from "./offline-queue.js";
import { recordDataOk } from "./data-freshness.js"; // v5.17: frescura de datos para el banner de estado

const noopUnsub = () => {};

// =====================================================
// v5.12.0 — Modo demo: catálogo editable guardado en este navegador
// =====================================================
// En la vista previa (sin Supabase) las categorías, marcas y productos que se
// crean o editan desde el admin quedan en localStorage y la app los ve al
// instante (misma pestaña: aviso directo; otra pestaña/marco: evento "storage").
const DEMO_CATALOG_KEY = "mannol-demo-catalog-v1";
const DEMO_CATALOG_SEED = 2; // subir si cambian los datos demo del catálogo
const _demoCatalogListeners = new Set();
let _demoCatalogStorageHooked = false;

function freshDemoCatalog() {
  const clone = (arr) => JSON.parse(JSON.stringify(arr || []));
  return { seed: DEMO_CATALOG_SEED, categories: clone(DEMO_CATEGORIES), brands: clone(DEMO_BRANDS), products: clone(DEMO_PRODUCTS) };
}
function loadDemoCatalog() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DEMO_CATALOG_KEY) : null;
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.seed === DEMO_CATALOG_SEED && Array.isArray(c.categories) && Array.isArray(c.brands) && Array.isArray(c.products)) return c;
    }
  } catch {}
  return freshDemoCatalog();
}
function emitDemoCatalog(c) {
  for (const fn of [..._demoCatalogListeners]) {
    try { fn(c); } catch (err) { console.warn("[demo catalog] listener:", err); }
  }
}
function updateDemoCatalog(mutator) {
  const c = loadDemoCatalog();
  const result = mutator(c); // si lanza, no se guarda nada
  try { localStorage.setItem(DEMO_CATALOG_KEY, JSON.stringify(c)); } catch {}
  emitDemoCatalog(c);
  return result;
}
function subscribeDemoCatalog(pick, cb) {
  if (!_demoCatalogStorageHooked && typeof window !== "undefined") {
    _demoCatalogStorageHooked = true;
    window.addEventListener("storage", (e) => {
      if (e.key === DEMO_CATALOG_KEY) emitDemoCatalog(loadDemoCatalog());
    });
  }
  const fn = (c) => cb(pick(c));
  _demoCatalogListeners.add(fn);
  fn(loadDemoCatalog());
  return () => _demoCatalogListeners.delete(fn);
}
function demoId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ¿El error es "esa tabla no existe" (migración sin ejecutar)?
function isMissingTableError(err, table) {
  if (err?.code === "PGRST205" || err?.code === "42P01") return true;
  const msg = String(err?.message || err?.details || err || "");
  return msg.includes(table) && /(schema cache|does not exist|no existe)/i.test(msg);
}

// Mensaje entendible para los errores más comunes de Supabase
function friendlyDbError(err, fallback) {
  const code = err?.code || "";
  const msg = String(err?.message || "");
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "Sin permiso para guardar: entra con un usuario administrador.";
  }
  if (code === "23505" || /duplicate key/i.test(msg)) return "Ya existe uno con ese nombre.";
  if (isMissingTableError(err, "brands")) {
    return "Falta crear la tabla de marcas en Supabase (Admin → Marcas explica cómo).";
  }
  return msg || fallback;
}
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
  // v5.21.0: pago mixto — recargo por USD cuando el resto se cobra en MN
  mixSurchargeOptions: [10, 20],    // botones que ve el vendedor (además de «Tasa»)
  mixSurchargeDefault: 10,          // el que viene marcado
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
  // v5.13.0: el modo demo depende SOLO de la configuración. Antes era
  // "!cliente": sin internet la librería no cargaba y la app mostraba
  // almacenes y productos de PRUEBA; las ventas hechas así subían después
  // sin almacén (mezcladas). Ahora, configurado + sin red = datos reales
  // guardados (service worker + copia local), nunca datos demo.
  let configured = false;
  try { configured = await isSupabaseConfiguredAsync(); } catch { configured = false; }
  _isDemo = !configured;
  _demoChecked = true;
  return _isDemo;
}

// =====================================================
// v5.13.0 — Copia local de datos críticos para abrir sin conexión
// =====================================================
// Almacenes (con su PIN), ajustes, gestores y tarjetas: se guarda la última
// respuesta buena. Si la red falla y el service worker no tiene la respuesta,
// se usa esta copia → el PIN y el almacén de cada venta siguen siendo reales.
const MIRROR_PREFIX = "mannol-mirror-v1:";
function mirrorSave(name, data) {
  try { localStorage.setItem(MIRROR_PREFIX + name, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function mirrorLoad(name) {
  try {
    const raw = localStorage.getItem(MIRROR_PREFIX + name);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.data !== undefined ? v.data : null;
  } catch { return null; }
}
/** Fecha (ms) de la última copia buena guardada de `name`, o null. */
export function getMirrorTimestamp(name) {
  try {
    const v = JSON.parse(localStorage.getItem(MIRROR_PREFIX + name) || "null");
    return v && v.ts ? v.ts : null;
  } catch { return null; }
}

// =====================================================
// v5.13.0 — Precarga para trabajar sin conexión
// =====================================================
// Las copias sin conexión (sw.js / supabase.js) se guardan por URL exacta.
// Para que "abrir la app una vez con internet" baste para vender después
// sin conexión en CUALQUIER almacén del equipo, se piden en segundo plano
// las mismas consultas que hace la pantalla de venta (mismo orden y filtros
// → misma URL → misma copia). Una vez cada 20 min como máximo.
const WARM_KEY = "mannol-offline-warm-v1";
const WARM_EVERY_MS = 20 * 60 * 1000;

export async function warmOfflineCache({ force = false } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { skipped: "offline" };
  if (await isDemo()) return { skipped: "demo" };
  try {
    const last = Number(localStorage.getItem(WARM_KEY) || 0);
    if (!force && Date.now() - last < WARM_EVERY_MS) return { skipped: "recent" };
  } catch {}
  const s = await sb();
  if (!s) return { skipped: "no-client" };
  const warehouses = await listWarehouses(); // también actualiza su copia local
  const ids = (warehouses || [])
    .filter((w) => w && w.active !== false && isUuid(String(w.id)))
    .map((w) => w.id);
  const tasks = [
    // mismas consultas que subscribeProducts / subscribeStock / subscribeCategories
    () => s.from("products").select("*").order("created_at", { ascending: true }),
    () => s.from("categories").select("*").order("sort_order", { ascending: true }),
    () => fetchBrands(),
    () => listCards(),
    () => listManagers(),
    () => getSettings(),
    ...ids.map((id) => () => s.from("stock").select("*").eq("warehouse_id", id)),
  ];
  let ok = 0;
  for (const task of tasks) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) break;
    try {
      const r = await task();
      if (!r || !r.error) ok++;
    } catch {}
    await new Promise((res) => setTimeout(res, 120)); // sin ráfagas
  }
  if (ok === tasks.length) {
    try { localStorage.setItem(WARM_KEY, String(Date.now())); } catch {}
  }
  return { ok, total: tasks.length, warehouses: ids.length };
}

// Firma de la cola: cambia solo si entran/salen ventas (no con reintentos)
function queueSignature(q) {
  return (q || []).map((x) => `${x.id}${x._blocked ? "!" : ""}`).join(",");
}
const isOnlineNow = () => typeof navigator === "undefined" || navigator.onLine !== false;

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
function subscribeTable({ channelName, table, filter, order, fn, demoData, isDemoMode, select }) {
  let unsub = noopUnsub;
  let delivered = false; // v5.13.0: con red inestable se conserva la última lista buena
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
      if (!delivered) fn([]);
    }
  })();

  async function refresh() {
    const s = await sb();
    if (!s) { if (!delivered) fn([]); return; }
    try {
      let query = s.from(table).select(select || "*");
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
      delivered = true;
    } catch (err) {
      console.error(`refresh ${table} failed:`, err);
      if (!delivered) fn([]);
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
// Caché TTL corta para settings: getSettings se consulta en muchos flujos
// (login PIN, ventas, dashboard) y era un viaje de red en cada uno.
let _settingsCache = { ts: 0, data: null };
const SETTINGS_CACHE_TTL = 60000;

export async function getSettings() {
  const demo = await isDemo();
  if (demo) return { ...DEFAULT_SETTINGS };
  if (_settingsCache.data && Date.now() - _settingsCache.ts < SETTINGS_CACHE_TTL) {
    return { ..._settingsCache.data };
  }
  const s = await sb();
  if (!s) return { ...DEFAULT_SETTINGS, ...(mirrorLoad("settings") || {}) };
  try {
    // v5.17: columnas seguras — pin_code ya no se lee (ni siquiera para admin;
    // el admin usa getSettingsAdmin). Con anon, select * fallaría por permisos.
    const BASE_COLS = "id, el_toque_enabled, el_toque_markup, business_name, last_rate_sync, weekend_warehouse_id, weekend_redirect_enabled";
    let { data, error } = await s.from("settings")
      .select(`${BASE_COLS}, mix_surcharge_options, mix_surcharge_default`)
      .eq("id", "global").maybeSingle();
    // v5.21.0: si aún no se ejecutó la migración (columnas nuevas), lista base
    if (error && (String(error.code) === "42703" || /does not exist|permission denied/i.test(error.message || ""))) {
      ({ data, error } = await s.from("settings").select(BASE_COLS).eq("id", "global").maybeSingle());
    }
    if (error) throw error;
    if (data) {
      const r = row(data);
      const merged = { ...DEFAULT_SETTINGS, ...r };
      // Guard: un pinCode null/vacío en la BD NO debe pisar el default,
      // dejaría el PIN esperado en null y ningún PIN funcionaría.
      if (r.pinCode == null || String(r.pinCode).trim() === "") {
        merged.pinCode = DEFAULT_SETTINGS.pinCode;
      }
      _settingsCache = { ts: Date.now(), data: merged };
      mirrorSave("settings", merged);
      return { ...merged };
    }
    // Create default row if missing
    const insertRow = sanitizeSettingsRow(toRow({ id: "global", ...DEFAULT_SETTINGS }));
    const { error: insErr } = await s.from("settings").insert(insertRow);
    if (insErr) console.warn("[getSettings] insert default failed:", insErr);
    const def = { ...DEFAULT_SETTINGS };
    _settingsCache = { ts: Date.now(), data: def };
    return { ...def };
  } catch (err) {
    console.warn("Settings load failed:", err);
    // v5.13.0: sin conexión → últimos ajustes reales (PIN global incluido)
    const mirror = mirrorLoad("settings");
    if (mirror) return { ...DEFAULT_SETTINGS, ...mirror };
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * v5.17: ajustes COMPLETOS (incluye pinCode) — solo con sesión de admin.
 * El panel de Ajustes es la única pantalla que muestra/edita el PIN global.
 * @returns {Promise<Settings>}
 */
export async function getSettingsAdmin() {
  const demo = await isDemo();
  if (demo) return { ...DEFAULT_SETTINGS };
  const s = await sb();
  if (!s) return getSettings(); // sin red: usa la caché que haya
  try {
    const { data, error } = await s.from("settings").select("*").eq("id", "global").maybeSingle();
    if (error) throw error;
    if (data) {
      const r = row(data);
      const merged = { ...DEFAULT_SETTINGS, ...r };
      if (r.pinCode == null || String(r.pinCode).trim() === "") {
        merged.pinCode = DEFAULT_SETTINGS.pinCode;
      }
      return { ...merged };
    }
    return { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.warn("getSettingsAdmin failed:", err);
    return getSettings();
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
  _settingsCache = { ts: 0, data: null }; // invalidar caché de settings
  try {
    const update = { ...sanitizeSettingsRow(toRow(settings)), id: "global" };
    let { error } = await s.from("settings").upsert(update, { onConflict: "id" });
    // v5.21.0: base sin la migración v5.21 → guardar sin las columnas nuevas
    if (error && (String(error.code) === "PGRST204" || String(error.code) === "42703" || /column/i.test(error.message || ""))) {
      const { mix_surcharge_options, mix_surcharge_default, ...rest } = update;
      if (mix_surcharge_options !== undefined || mix_surcharge_default !== undefined) {
        ({ error } = await s.from("settings").upsert(rest, { onConflict: "id" }));
      }
    }
    if (error) throw error;
  } catch (err) {
    console.error("saveSettings failed:", err);
  }
}

/**
 * v5.21.0: guarda los recargos del pago mixto (admin). A diferencia de
 * saveSettings, avisa si falla (p. ej. falta la migración v5.21).
 * @param {number[]} options  recargos en MN por USD (ej. [10, 20])
 * @param {number} def        el que viene marcado (0 = tasa del día)
 */
export async function saveMixSurchargeSettings(options, def) {
  const s = await sb();
  if (!s) return; // modo demo: solo en memoria (store)
  _settingsCache = { ts: 0, data: null };
  const { error } = await s.from("settings").upsert({
    id: "global",
    mix_surcharge_options: options,
    mix_surcharge_default: def,
  }, { onConflict: "id" });
  if (error) {
    if (String(error.code) === "PGRST204" || String(error.code) === "42703" || /column/i.test(error.message || "")) {
      throw new Error("Falta ejecutar supabase/instalar.sql en Supabase para guardar los recargos.");
    }
    throw new Error(error.message || "No se pudo guardar");
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
/**
 * Suma las comisiones del gestor y del vendedor de un carrito,
 * separadas por moneda. Función PURA (testeada en tests/sale-commissions.test.js).
 * El item sin moneda de comisión asume USD para gestor y MN para vendedor
 * (mismos defaults que usaba el cálculo inline en sales.js).
 *
 * @param {Array<{quantity:number, gestorCommission?:number, gestorCommissionCurrency?:string, vendorCommission?:number, vendorCommissionCurrency?:string}>} cart
 * @returns {{gestorCommissionUSD:number, gestorCommissionMN:number, vendorCommissionUSD:number, vendorCommissionMN:number}}
 */
export function sumCartCommissions(cart) {
  let gestorUSD = 0, gestorMN = 0, vendorUSD = 0, vendorMN = 0;
  for (const item of cart || []) {
    const gCom = item.gestorCommission || 0;
    const gCurr = item.gestorCommissionCurrency || "USD";
    const vCom = item.vendorCommission || 0;
    const vCurr = item.vendorCommissionCurrency || "MN";
    if (gCurr === "USD") gestorUSD += gCom * item.quantity;
    else gestorMN += gCom * item.quantity;
    if (vCurr === "USD") vendorUSD += vCom * item.quantity;
    else vendorMN += vCom * item.quantity;
  }
  return {
    gestorCommissionUSD: gestorUSD,
    gestorCommissionMN: gestorMN,
    vendorCommissionUSD: vendorUSD,
    vendorCommissionMN: vendorMN,
  };
}

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
// Caché TTL corta para warehouses: evita re-query en cada navegación/click.
// Se invalida al guardar (saveWarehouse).
let _whCache = { ts: 0, data: null };
const WH_CACHE_TTL = 30000;

// v5.17: columnas de warehouses seguras para anon (sesiones PIN). El PIN
// (pin/pin_salt/pin_hash) se valida en el servidor con verify_warehouse_pin.
export const WAREHOUSE_SAFE_COLUMNS =
  "id, name, code, address, phone, active, seller_commission_percent, seller_commission_currency, seller_weekend_split, seller_name, seller_weekend_name, created_at";

// Lista sin las columnas de vendedores (v5.14): para bases de datos donde esa
// migración aún no se ejecutó (la lista completa daría error 42703).
export const WAREHOUSE_SAFE_COLUMNS_LEGACY =
  "id, name, code, address, phone, active, seller_commission_percent, seller_commission_currency, created_at";

export async function listWarehouses() {
  const demo = await isDemo();
  if (demo) return DEMO_WAREHOUSES;
  const s = await sb();
  if (!s) return mirrorLoad("warehouses") || [];
  if (_whCache.data && Date.now() - _whCache.ts < WH_CACHE_TTL) {
    return _whCache.data.map((w) => ({ ...w }));
  }
  const fetchList = async (cols) => {
    const { data, error } = await s.from("warehouses")
      .select(cols)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  };
  try {
    // v5.17: columnas seguras (anon no tiene permiso para `select *`)
    let list;
    try {
      list = await fetchList(WAREHOUSE_SAFE_COLUMNS);
    } catch (err) {
      if (isMissingSellerColumnsError(err)) {
        // La BD aún no tiene las columnas de vendedores (migration-v5.14 pendiente)
        console.warn("[listWarehouses] columnas de vendedores ausentes — uso lista antigua");
        list = await fetchList(WAREHOUSE_SAFE_COLUMNS_LEGACY);
      } else {
        throw err;
      }
    }
    _whCache = { ts: Date.now(), data: list };
    mirrorSave("warehouses", list);
    return list.map((w) => ({ ...w }));
  } catch (err) {
    console.error("listWarehouses failed:", err);
    // v5.13.0: sin conexión → últimos almacenes REALES guardados (nunca demo)
    const mirror = mirrorLoad("warehouses");
    if (Array.isArray(mirror) && mirror.length) return mirror;
    return [];
  }
}

/**
 * v5.17: lista COMPLETA de almacenes (incluye pin) — solo con sesión de
 * admin. La usan el editor de almacenes de Admin y de Ajustes.
 * @returns {Promise<Array>}
 */
export async function listWarehousesAdmin() {
  const demo = await isDemo();
  if (demo) return DEMO_WAREHOUSES;
  const s = await sb();
  if (!s) return listWarehouses();
  try {
    const { data, error } = await s.from("warehouses").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch (err) {
    console.warn("listWarehousesAdmin failed:", err);
    return listWarehouses();
  }
}

/**
 * v5.17: valida el PIN del almacén EN EL SERVIDOR (RPC verify_warehouse_pin,
 * migration-v5.17-seguridad.sql). El PIN ya no se lee de la tabla: anon no
 * tiene permiso para la columna `pin`. Si es correcto, la RPC devuelve los
 * datos públicos del almacén + un hash (SHA-256+sal) para revalidar sin
 * conexión; si no, { ok:false, reason } con rate limit de 5/10 min.
 * Lanza el error de red si la conexión falla (el que llama decide el fallback).
 * @param {string} code - código del almacén ("VIB")
 * @param {string} pin
 * @returns {Promise<{ok:boolean, reason?:string, retryAfterSec?:number, pinSource?:string, pinLength?:number, pinSalt?:string, pinHash?:string, warehouse?:Object}>}
 */
export async function verifyWarehousePin(code, pin) {
  const s = await sb();
  if (!s) {
    const e = new Error("SIN_CLIENTE");
    e.code = "SIN_CLIENTE";
    throw e;
  }
  // v5.23.3: era s.rpc(...) → no existe en el envoltorio (es s.client.rpc):
  // la validación SIEMPRE fallaba con «No se pudo validar el PIN».
  const { data, error } = await s.client.rpc("verify_warehouse_pin", { p_code: code, p_pin: pin });
  if (error) throw error;
  return data || { ok: false, reason: "wrong_pin" };
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
    select: WAREHOUSE_SAFE_COLUMNS, // v5.17: anon no puede hacer select *
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
// v5.14.0: columnas reales de `warehouses`. Lo demás que envíe la UI se
// descarta aquí: el formulario del admin mandaba `_createdBy` (para la
// auditoría del stock inicial) → «_created_by» no existe → PGRST204, y el
// almacén NO se guardaba aunque la pantalla dijera «Almacén guardado».
export const WAREHOUSE_SELLER_COLUMNS = ["seller_weekend_split", "seller_name", "seller_weekend_name"];
export const WAREHOUSE_COLUMNS = new Set([
  "id", "name", "code", "address", "phone", "active", "pin",
  "seller_commission_percent", "seller_commission_currency", "created_at",
  ...WAREHOUSE_SELLER_COLUMNS, // migration-v5.14-vendedores.sql
]);

export function sanitizeWarehouseRow(r) {
  const out = {};
  for (const [k, v] of Object.entries(r || {})) {
    if (WAREHOUSE_COLUMNS.has(k)) out[k] = v;
  }
  return out;
}

/** ¿Falta alguna columna de vendedores? (migración v5.14 aún sin ejecutar) */
export function isMissingSellerColumnsError(err) {
  if (!err || (err.code !== "PGRST204" && err.code !== "42703")) return false;
  const text = `${err.message || ""} ${err.details || ""} ${err.hint || ""}`;
  return WAREHOUSE_SELLER_COLUMNS.some((c) => text.includes(c));
}

// true si el último guardado omitió los vendedores del almacén porque la
// migración v5.14 aún no se ejecutó (el resto del almacén sí se guardó).
export let lastWarehouseSaveSkippedSellers = false;

export async function saveWarehouse(w) {
  const s = await sb();
  _whCache = { ts: 0, data: null }; // invalidar caché de warehouses
  lastWarehouseSaveSkippedSellers = false;
  if (!s) return "demo-id";
  // Al editar NO se reescribe created_at (antes se ponía la fecha actual y el
  // almacén pasaba al final de la lista, que se ordena por fecha de creación).
  const base = w.id ? { ...w } : { ...w, createdAt: w.createdAt || Date.now() };
  const full = sanitizeWarehouseRow(toRow(base));
  const attempt = async (r) => {
    if (w.id) {
      const { error } = await s.from("warehouses").update(r).eq("id", w.id);
      if (error) throw error;
      return w.id;
    }
    const { data, error } = await s.from("warehouses").insert(r).select().single();
    if (error) throw error;
    return data.id;
  };
  try {
    return await attempt(full);
  } catch (err) {
    if (isMissingSellerColumnsError(err) && WAREHOUSE_SELLER_COLUMNS.some((c) => c in full)) {
      const r = { ...full };
      WAREHOUSE_SELLER_COLUMNS.forEach((c) => { delete r[c]; });
      const id = await attempt(r); // si también falla, el error sube a la pantalla
      lastWarehouseSaveSkippedSellers = true;
      return id;
    }
    console.error("saveWarehouse failed:", err);
    // v5.14.0: el error llega a la pantalla (antes devolvía "demo-id" y el admin
    // veía «Almacén guardado» aunque no se hubiera guardado nada)
    throw err;
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
export async function getUserByEmail(email, { throwOnError = false } = {}) {
  const s = await sb();
  if (!s) return null;
  try {
    // v5.20.0: sin distinguir mayúsculas (perfiles creados a mano con
    // "Admin@…" no se encontraban y el login decía «no tiene perfil»).
    const clean = String(email || "").trim().toLowerCase().replace(/[%_\\]/g, "\\$&");
    const { data, error } = await s.from("users").select("*").ilike("email", clean).limit(1);
    if (error) throw error;
    return data && data[0] ? row(data[0]) : null;
  } catch (err) {
    console.error("getUserByEmail failed:", err);
    if (throwOnError) throw err;
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
  let unsub = noopUnsub;
  let stopped = false;
  (async () => {
    if (await isDemo()) {
      if (!stopped) unsub = subscribeDemoCatalog((c) => c.categories, cb);
      return;
    }
    if (stopped) return;
    unsub = subscribeTable({
      channelName: "categories-ch",
      table: "categories",
      order: ["sort_order", "asc"],
      fn: cb,
      demoData: [],
      isDemoMode: false,
    });
  })();
  return () => { stopped = true; unsub(); };
}

/**
 * Crea o actualiza una categoría. v5.12.0: lanza el error real (antes lo
 * tragaba y la pantalla decía "guardada" aunque Supabase la rechazara).
 */
export async function saveCategory(c) {
  // Normalize: support both 'order' (legacy) and 'sortOrder' (canonical)
  const normalized = { ...c };
  if (normalized.order !== undefined && normalized.sortOrder === undefined) {
    normalized.sortOrder = normalized.order;
    delete normalized.order;
  }
  if (await isDemo()) {
    return updateDemoCatalog((cat) => {
      if (normalized.id) {
        const i = cat.categories.findIndex((x) => x.id === normalized.id);
        if (i >= 0) { cat.categories[i] = { ...cat.categories[i], ...normalized }; return normalized.id; }
      }
      const id = normalized.id || demoId("cat");
      cat.categories.push({ active: true, parentId: null, sortOrder: 0, ...normalized, id, createdAt: Date.now() });
      return id;
    });
  }
  const s = await sb();
  if (!s) throw new Error("Sin conexión con la base de datos");
  try {
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
    throw new Error(friendlyDbError(err, "No se pudo guardar la categoría"));
  }
}

export async function deleteCategory(id) {
  if (await isDemo()) {
    updateDemoCatalog((cat) => {
      // Igual que la BD: las subcategorías se borran en cascada y los
      // productos quedan sin categoría.
      const doomed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const x of cat.categories) {
          if (x.parentId && doomed.has(x.parentId) && !doomed.has(x.id)) { doomed.add(x.id); grew = true; }
        }
      }
      cat.categories = cat.categories.filter((x) => !doomed.has(x.id));
      for (const p of cat.products) {
        if (doomed.has(p.categoryId)) { p.categoryId = null; p.categoryName = null; }
      }
    });
    return;
  }
  const s = await sb();
  if (!s) throw new Error("Sin conexión con la base de datos");
  const { error } = await s.from("categories").delete().eq("id", id);
  if (error) {
    console.error("deleteCategory failed:", error);
    throw new Error(friendlyDbError(error, "No se pudo eliminar la categoría"));
  }
}

// =====================================================
// ============ Brands (v5.12.0) ============
// =====================================================
// Tabla `brands` (supabase/migration-v5.12-brands.sql). Si la migración aún
// no se ejecutó, la lista sale vacía con `missingTable: true` y el catálogo
// sigue mostrando las marcas que usan los productos.
let _brandsTableMissing = false;

/** @returns {Promise<{brands: Object[], missingTable: boolean, error?: string}>} */
export async function fetchBrands() {
  if (await isDemo()) return { brands: loadDemoCatalog().brands, missingTable: false };
  const s = await sb();
  if (!s) return { brands: [], missingTable: false };
  try {
    const { data, error } = await s.from("brands").select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    _brandsTableMissing = false;
    return { brands: rows(data), missingTable: false };
  } catch (err) {
    if (isMissingTableError(err, "brands")) {
      _brandsTableMissing = true;
      return { brands: [], missingTable: true };
    }
    console.error("fetchBrands failed:", err);
    return { brands: [], missingTable: false, error: err?.message || String(err) };
  }
}

export async function listBrands() {
  return (await fetchBrands()).brands;
}

export function isBrandsTableMissing() {
  return _brandsTableMissing;
}

export function subscribeBrands(cb) {
  let unsub = noopUnsub;
  let stopped = false;
  (async () => {
    if (await isDemo()) {
      if (!stopped) unsub = subscribeDemoCatalog((c) => c.brands, cb);
      return;
    }
    const s = await sb();
    if (!s) { cb([]); return; }
    const refresh = async () => {
      const { brands, missingTable } = await fetchBrands();
      if (!stopped) cb(brands);
      return missingTable;
    };
    const missing = await refresh();
    if (missing || stopped) return; // sin tabla no hay cambios que escuchar
    try {
      const channel = s.channel("brands-ch");
      channel.on("postgres_changes", { event: "*", schema: "public", table: "brands" }, () => refresh());
      channel.subscribe();
      unsub = () => { try { s.client.removeChannel(channel); } catch {} };
    } catch (err) {
      console.error("subscribeBrands failed:", err);
    }
  })();
  return () => { stopped = true; unsub(); };
}

/** Crea o actualiza una marca. Lanza el error real (duplicada, sin permiso, sin tabla…). */
export async function saveBrand(b) {
  const data = { ...b, name: String(b?.name || "").replace(/\s+/g, " ").trim() };
  if (!data.name) throw new Error("El nombre de la marca es obligatorio");
  data.slug = slugify(data.name) || data.slug || demoId("marca");
  if (await isDemo()) {
    return updateDemoCatalog((cat) => {
      const dup = cat.brands.find((x) => x.slug === data.slug && x.id !== data.id);
      if (dup) throw new Error(`Ya existe la marca «${dup.name}».`);
      if (data.id) {
        const i = cat.brands.findIndex((x) => x.id === data.id);
        if (i >= 0) { cat.brands[i] = { ...cat.brands[i], ...data }; return data.id; }
      }
      const id = data.id || demoId("br");
      cat.brands.push({ color: "slate", sortOrder: 0, active: true, ...data, id, createdAt: Date.now() });
      return id;
    });
  }
  const s = await sb();
  if (!s) throw new Error("Sin conexión con la base de datos");
  try {
    const r = toRow(data);
    if (data.id) {
      const { error } = await s.from("brands").update(r).eq("id", data.id);
      if (error) throw error;
      return data.id;
    }
    const { data: created, error } = await s.from("brands").insert(r).select().single();
    if (error) throw error;
    return created.id;
  } catch (err) {
    console.error("saveBrand failed:", err);
    if (err?.code === "23505" || /duplicate key/i.test(String(err?.message || ""))) {
      throw new Error(`Ya existe la marca «${data.name}».`);
    }
    throw new Error(friendlyDbError(err, "No se pudo guardar la marca"));
  }
}

export async function deleteBrand(id) {
  if (await isDemo()) {
    updateDemoCatalog((cat) => { cat.brands = cat.brands.filter((x) => x.id !== id); });
    return;
  }
  const s = await sb();
  if (!s) throw new Error("Sin conexión con la base de datos");
  const { error } = await s.from("brands").delete().eq("id", id);
  if (error) {
    console.error("deleteBrand failed:", error);
    throw new Error(friendlyDbError(error, "No se pudo eliminar la marca"));
  }
}

/**
 * Cambia la marca escrita en los productos (p. ej. al renombrar "Mannol" →
 * "MANNOL"). Compara sin mayúsculas/tildes/espacios. Devuelve cuántos cambió.
 */
export async function renameBrandInProducts(oldName, newName) {
  const to = String(newName || "").replace(/\s+/g, " ").trim();
  const fromKey = normalizeKey(oldName);
  if (!fromKey || !to) return 0;
  if (await isDemo()) {
    return updateDemoCatalog((cat) => {
      let n = 0;
      for (const p of cat.products) {
        if (normalizeKey(p.brand) === fromKey && p.brand !== to) { p.brand = to; n++; }
      }
      return n;
    });
  }
  const s = await sb();
  if (!s) throw new Error("Sin conexión con la base de datos");
  const { data: prods, error: e1 } = await s.from("products").select("id, brand");
  if (e1) throw new Error(friendlyDbError(e1, "No se pudieron leer los productos"));
  const ids = (prods || []).filter((p) => normalizeKey(p.brand) === fromKey && p.brand !== to).map((p) => p.id);
  if (!ids.length) return 0;
  const { error } = await s.from("products").update({ brand: to }).in("id", ids);
  if (error) throw new Error(friendlyDbError(error, "No se pudo cambiar la marca en los productos"));
  return ids.length;
}

/**
 * v5.12.0: cambia SOLO el tipo (categoría) y/o la marca de varios productos
 * (Admin → Organizar productos). No toca precios, imágenes ni comisiones.
 * @param {{id:string, categoryId?:string|null, categoryName?:string|null, brand?:string}[]} updates
 * @param {(done:number, total:number) => void} [onProgress]
 * @returns {Promise<{ok:number, failed:{id:string, error:string}[]}>}
 */
export async function updateProductsCatalogFields(updates, onProgress) {
  const clean = (u) => {
    const o = {};
    if ("categoryId" in u) o.categoryId = u.categoryId || null;
    if ("categoryName" in u) o.categoryName = u.categoryName || null;
    if ("brand" in u && String(u.brand || "").trim()) o.brand = String(u.brand).replace(/\s+/g, " ").trim();
    return o;
  };
  const list = (updates || []).filter((u) => u && u.id);
  if (await isDemo()) {
    updateDemoCatalog((cat) => {
      for (const u of list) {
        const p = cat.products.find((x) => x.id === u.id);
        if (p) Object.assign(p, clean(u));
      }
    });
    onProgress?.(list.length, list.length);
    return { ok: list.length, failed: [] };
  }
  const s = await sb();
  if (!s) throw new Error("Sin conexión con la base de datos");
  let ok = 0;
  let done = 0;
  const failed = [];
  for (let i = 0; i < list.length; i += 6) { // de a 6 en paralelo
    await Promise.all(list.slice(i, i + 6).map(async (u) => {
      const r = toRow(clean(u));
      try {
        if (Object.keys(r).length) {
          const { error } = await s.from("products").update(r).eq("id", u.id);
          if (error) throw error;
        }
        ok++;
      } catch (err) {
        console.error("updateProductsCatalogFields:", u.id, err);
        failed.push({ id: u.id, error: friendlyDbError(err, "No se pudo guardar") });
      } finally {
        onProgress?.(++done, list.length);
      }
    }));
  }
  return { ok, failed };
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
    if (demo) { unsub = subscribeDemoCatalog((c) => c.products, cb); return; }
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
        recordDataOk("products"); // v5.17: para «datos de hace X» en el banner
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
  "image_url", "thumb_url", "active", "units_per_box", "wholesale_tiers", "created_at",
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
  if (!s) {
    // v5.12.0: en demo el producto queda guardado en este navegador
    return updateDemoCatalog((cat) => {
      if (p.id) {
        const i = cat.products.findIndex((x) => x.id === p.id);
        if (i >= 0) { cat.products[i] = { ...cat.products[i], ...p }; return p.id; }
      }
      const id = p.id || demoId("pr");
      cat.products.push({ active: true, ...p, id, createdAt: p.createdAt || Date.now() });
      return id;
    });
  }
  try {
    // Detectar imagen reemplazada para borrar la huérfana
    if (p.id && p.imageUrl) {
      try {
        const { data: existing } = await s.from("products").select("image_url, thumb_url").eq("id", p.id).maybeSingle();
        if (existing?.image_url && existing.image_url !== p.imageUrl) {
          await deleteStorageImageByUrl(s, existing.image_url);
        }
        // La miniatura vieja también se limpia si cambió la imagen principal
        if (existing?.thumb_url && existing.thumb_url !== (p.thumbUrl || null)) {
          await deleteStorageImageByUrl(s, existing.thumb_url);
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
  if (!s) {
    updateDemoCatalog((cat) => { cat.products = cat.products.filter((x) => x.id !== id); });
    return;
  }
  try {
    // 1. Obtener la imagen antes de borrar el producto, para limpiar storage
    try {
      const { data: existing } = await s.from("products").select("image_url, thumb_url").eq("id", id).maybeSingle();
      if (existing?.image_url) {
        await deleteStorageImageByUrl(s, existing.image_url);
      }
      if (existing?.thumb_url) {
        await deleteStorageImageByUrl(s, existing.thumb_url);
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
  if (demo) return loadDemoCatalog().products;
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
  if (demo) return loadDemoCatalog().categories;
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
  let last = null;       // filas tal como llegan (nube / caché / demo)
  let stopped = false;
  let refreshFn = null;
  let sig = queueSignature(readQueue());
  // v5.13.0: el stock que ve el vendedor descuenta las ventas que siguen en
  // cola DE ESTE almacén (hechas sin conexión) → no vende lo que ya salió.
  const emit = () => { if (!stopped && last) cb(applyPendingToStock(last, readQueue(), warehouseId)); };
  const unsubQueue = subscribeQueue((q) => {
    const nextSig = queueSignature(q);
    const changed = nextSig !== sig;
    sig = nextSig;
    // Si entró/salió una venta y hay red, se relee el stock real de la nube
    if (changed && refreshFn && isOnlineNow()) refreshFn();
    else emit();
  });
  (async () => {
    const demo = await isDemo();
    if (demo) { last = DEMO_STOCK.filter((s) => s.warehouseId === warehouseId); emit(); return; }
    const s = await sb();
    if (!s) { last = []; emit(); return; }
    try {
      refreshFn = refresh;
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
      if (!last) { last = []; emit(); }
    }
    async function refresh() {
      try {
        const { data, error } = await s.from("stock").select("*").eq("warehouse_id", warehouseId);
        if (error) throw error;
        recordDataOk(`stock:${warehouseId}`); // v5.17: «stock de hace X min»
        last = rows(data);
      } catch (err) {
        console.error("refresh stock failed:", err);
        if (!last) last = []; // se conserva el último stock bueno
      }
      emit();
    }
  })();
  return () => { stopped = true; unsubQueue(); unsub(); };
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
    // (p_warehouse_id/p_product_id/p_user_id son uuid: si llega un id
    // sintético tipo "pin-..." se envía null para no romper la RPC con 22P02)
    const { error } = await s.client.rpc("adjust_stock", {
      p_warehouse_id: nullIfNotUuid(warehouseId),
      p_product_id: nullIfNotUuid(productId),
      p_delta: delta,
      p_reason: reason,
      p_note: note,
      p_user_id: nullIfNotUuid(userId),
      p_user_name: userName,
    });
    if (error) throw error;
  } catch (err) {
    console.error("adjustStock failed:", err);
    // Propagar para que la UI pueda mostrar el error real (RLS, red, etc.)
    throw err instanceof Error ? err : new Error(String(err?.message || "No se pudo ajustar el stock"));
  }
}

/**
 * Descuenta el stock de una venta sincronizada de forma ATÓMICA (RPC
 * deduct_sale_stock, migration-v5.3-improvements.sql). Solo descuenta
 * los items con stock suficiente — así dos puestos que vendieron lo
 * mismo offline nunca dejan el inventario en negativo. Los items sin
 * stock vuelven en `shortages` para avisar al usuario.
 *
 * Lanza Error con code="RPC_MISSING" si la función no está instalada
 * (instalaciones viejas) para que el caller use el desconto clásico.
 *
 * @param {Sale} sale
 * @returns {Promise<{ok: boolean, deducted: number, shortages: Array<{product_id: string, requested: number, available: number}>}>}
 */
export async function deductSaleStockAtomic(sale) {
  const s = await sb();
  if (!s) {
    const e = new Error("RPC_MISSING");
    e.code = "RPC_MISSING";
    throw e;
  }
  const items = (sale.items || []).map((i) => ({
    product_id: i.productId,
    quantity: Number(i.quantity) || 0,
  }));
  const { data, error } = await s.client.rpc("deduct_sale_stock", {
    p_warehouse_id: nullIfNotUuid(sale.warehouseId),
    p_items: items,
    p_reason: "VENTA",
    p_note: `Venta ${sale.code}${sale.clientRef ? " (sync)" : ""}`,
    p_user_id: nullIfNotUuid(sale.userId),
    p_user_name: sale.userName || null,
  });
  if (error) {
    // PGRST202 = función inexistente en el esquema (instalación sin la migración)
    if (error.code === "PGRST202" || /function.*not.*exist|schema cache/i.test(error.message || "")) {
      const e = new Error("RPC_MISSING");
      e.code = "RPC_MISSING";
      throw e;
    }
    throw error;
  }
  return data || { ok: true, deducted: 0, shortages: [] };
}

/**
 * @param {string} [warehouseId] - optional filter
 * @returns {Promise<Stock[]>}
 */
export async function listStock(warehouseId) {
  const demo = await isDemo();
  if (demo) return warehouseId ? applyPendingToStock(DEMO_STOCK.filter((s) => s.warehouseId === warehouseId), readQueue(), warehouseId) : DEMO_STOCK;
  const s = await sb();
  if (!s) return [];
  try {
    let query = s.from("stock").select("*");
    if (warehouseId) query = query.eq("warehouse_id", warehouseId);
    const { data, error } = await query;
    if (error) throw error;
    // v5.13.0: descontar las ventas en cola de ESTE almacén (solo con filtro)
    return warehouseId ? applyPendingToStock(rows(data), readQueue(), warehouseId) : rows(data);
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
    // Rango de fechas en la BD (índice created_at) — opcional
    if (filters.from) query = query.gte("created_at", new Date(filters.from).toISOString());
    if (filters.to) query = query.lte("created_at", new Date(filters.to).toISOString());
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
  let last = null;
  let stopped = false;
  let refreshFn = null;
  let sig = queueSignature(readQueue());
  // v5.13.0: las ventas que siguen en cola en ESTE equipo aparecen en la
  // lista marcadas "pendiente de subir" — solo si cumplen el filtro (p. ej.
  // el almacén): nunca se muestran en la lista de otro almacén.
  const emit = () => { if (!stopped && last) cb(mergePendingSales(last, readQueue(), filters)); };
  const unsubQueue = subscribeQueue((q) => {
    const nextSig = queueSignature(q);
    const changed = nextSig !== sig;
    sig = nextSig;
    if (changed && refreshFn && isOnlineNow()) refreshFn();
    else emit();
  });
  (async () => {
    const demo = await isDemo();
    if (demo) {
      let items = [...DEMO_SALES];
      if (filters.warehouseId) items = items.filter((s) => s.warehouseId === filters.warehouseId);
      items.sort((a, b) => b.createdAt - a.createdAt);
      last = items;
      emit();
      return;
    }
    const s = await sb();
    if (!s) { last = []; emit(); return; }
    try {
      refreshFn = refresh;
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
      if (!last) { last = []; emit(); }
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
        last = items;
      } catch (err) {
        console.error("refresh sales failed:", err);
        if (!last) last = []; // se conserva la última lista buena
      }
      emit();
    }
  })();
  return () => { stopped = true; unsubQueue(); unsub(); };
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
    return mergePendingSales(items, readQueue(), filters);
  }
  const s = await sb();
  if (!s) return mergePendingSales([], readQueue(), filters);
  try {
    let query = s.from("sales").select("*");
    if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.managerId) query = query.eq("manager_id", filters.managerId);
    // Filtrar en la BD (usa el índice created_at) — sin esto trae TODAS las ventas históricas
    if (filters.from) query = query.gte("created_at", new Date(filters.from).toISOString());
    if (filters.to) query = query.lte("created_at", new Date(filters.to).toISOString());
    query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    let items = rows(data);
    if (filters.from) items = items.filter((i) => i.createdAt >= filters.from);
    if (filters.to) items = items.filter((i) => i.createdAt <= filters.to);
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    // v5.13.0: + ventas aún en cola de este equipo que cumplan el filtro
    return mergePendingSales(items, readQueue(), filters);
  } catch {
    return mergePendingSales([], readQueue(), filters);
  }
}

/**
 * v5.14.0: ventas de un rango [from, to) por páginas. La nube devuelve como
 * máximo 1000 filas por consulta y un mes de varios almacenes puede pasarse.
 * Devuelve null si no se pudo cargar (sin conexión y sin copia guardada).
 * @param {{warehouseId?: string|null, from: number, to: number}} range
 * @returns {Promise<Sale[]|null>}
 */
export async function listSalesInRange({ warehouseId = null, from, to } = {}) {
  const filters = { ...(warehouseId ? { warehouseId } : {}), from, to: to - 1 };
  const demo = await isDemo();
  if (demo) return listSales(filters);
  const s = await sb();
  if (!s) return listSales(filters);
  const PAGE = 1000;
  const out = [];
  try {
    for (let page = 0; page < 50; page++) {
      let q = s.from("sales").select("*");
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      q = q.gte("created_at", new Date(from).toISOString())
        .lt("created_at", new Date(to).toISOString())
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...rows(data));
      if (!data || data.length < PAGE) break;
    }
    return mergePendingSales(out, readQueue(), filters);
  } catch (err) {
    console.warn("listSalesInRange failed:", err);
    return null;
  }
}

// Columnas reales de la tabla `sales` (schema.sql + migración v2 de fin de
// semana). Cualquier campo extra que envíe la UI o la cola offline se
// descarta aquí para evitar el error PGRST204 ("Could not find the 'X'
// column of 'sales'"), que dejaba las ventas "pendientes" para siempre.
// Caso real: las ventas encoladas llevan `_syncAttempts` → `_sync_attempts`,
// una columna que NO existe en la BD → cada reintento fallaba en silencio.
export const SALE_COLUMNS = new Set([
  "id", "code", "client_ref",
  "warehouse_id", "warehouse_name", "warehouse_code",
  "user_id", "user_name",
  "manager_id", "manager_name", "manager_code",
  "customer_name",
  "items", "total_amount", "total_usd",
  "payments", "is_multi_currency", "payment_mode", "currency",
  "paid_usd", "paid_mn", "paid_eur", "paid_transfer",
  "payment_method",
  "card_id", "card_number", "card_name", "transfer_amount",
  "note", "status",
  "completed_at", "cancelled_at", "cancel_reason",
  "gestor_commission_usd", "gestor_commission_mn",
  "vendor_commission_usd", "vendor_commission_mn",
  "sale_type", "boxes", "price_per_box",
  "vendor_commission_per_box", "gestor_commission_per_box",
  "weekend_redirect", "original_warehouse_id", "weekend_warehouse_id",
  "created_at", "synced_at",
]);

// Columnas de `sales` que son tipo uuid en la BD. Ojo: `id` y `client_ref`
// son TEXT (la app genera ids "S-..." y clientRefs uuid con fallback).
export const SALE_UUID_COLUMNS = new Set([
  "warehouse_id", "user_id", "manager_id", "card_id",
  "original_warehouse_id", "weekend_warehouse_id",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un UUID válido? (las sesiones PIN usan ids "pin-...", las ventas "S-...") */
export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Devuelve el valor si es UUID válido; si no, null (para parámetros/columnas uuid). */
export function nullIfNotUuid(v) {
  if (v == null) return null;
  return isUuid(String(v)) ? v : null;
}

export function sanitizeSaleRow(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (!SALE_COLUMNS.has(k)) continue;
    // Columnas uuid: si el valor no es un UUID válido (ej. "pin-1789..." de una
    // sesión PIN o "S-169..." de generateSaleId), se omite para evitar el error
    // 22P02 "invalid input syntax for type uuid" que dejaba la venta pendiente.
    if (SALE_UUID_COLUMNS.has(k) && v != null && !isUuid(String(v))) continue;
    out[k] = v;
  }
  return out;
}

// Columnas reales de la tabla `settings`. `weekendWarehouseName` es solo
// de app (caché denormalizada) y NO existe en la BD — si se enviara,
// el guardado de configuración fallaría con PGRST204.
export const SETTINGS_COLUMNS = new Set([
  "id", "pin_code", "el_toque_enabled", "el_toque_markup",
  "business_name", "last_rate_sync",
  "weekend_warehouse_id", "weekend_redirect_enabled",
  "mix_surcharge_options", "mix_surcharge_default", // v5.21.0
]);

export function sanitizeSettingsRow(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (!SETTINGS_COLUMNS.has(k)) continue;
    // weekend_warehouse_id es uuid en la BD: descartar ids sintéticos (22P02)
    if (k === "weekend_warehouse_id" && v != null && !isUuid(String(v))) continue;
    out[k] = v;
  }
  return out;
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
    const r = sanitizeSaleRow(toRow({ ...sale, syncedAt: sale.syncedAt || Date.now() }));
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
 * v5.13.0 — Sube UNA venta de la cola con la RPC `register_sale`
 * (supabase/migration-v5.13-offline-sales.sql): guarda la venta y descuenta
 * el stock de SU almacén en UNA sola transacción, y es idempotente por
 * client_ref (si la venta ya estaba, no guarda ni descuenta nada otra vez).
 * Así un reintento tras un corte de red nunca duplica la venta ni el stock.
 *
 * Lanza Error code="RPC_MISSING" si la base de datos aún no tiene la RPC
 * (el llamador usa entonces el método anterior).
 *
 * @param {Sale} sale
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{ok: boolean, duplicate: boolean, sale_id?: string, deducted?: number, shortages?: Array}>}
 */
export async function registerSaleRemote(sale, { timeoutMs = 20000 } = {}) {
  const s = await sb();
  if (!s) {
    const e = new Error("RPC_MISSING");
    e.code = "RPC_MISSING";
    throw e;
  }
  const row = sanitizeSaleRow(toRow({ ...sale, syncedAt: Date.now() }));
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    let q = s.client.rpc("register_sale", { p_sale: row });
    if (ctrl && typeof q.abortSignal === "function") q = q.abortSignal(ctrl.signal);
    const { data, error } = await q;
    if (error) {
      const msg = String(error.message || "");
      if (error.code === "PGRST202" || /could not find the function|schema cache|function public\.register_sale.* does not exist/i.test(msg)) {
        const e = new Error("RPC_MISSING");
        e.code = "RPC_MISSING";
        throw e;
      }
      throw error;
    }
    return data || { ok: true, duplicate: false, shortages: [] };
  } finally {
    if (timer) clearTimeout(timer);
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
      p_user_id: nullIfNotUuid(userId),
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
      s.from("warehouses").select(WAREHOUSE_SAFE_COLUMNS).eq("id", warehouseId).maybeSingle(),
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

    const { data: wh, error: whErr } = await s.from("warehouses")
      .select(WAREHOUSE_SAFE_COLUMNS)
      .eq("id", warehouseId).maybeSingle();
    if (whErr) throw whErr;
    return {
      warehouse: wh ? row(wh) : null,
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
  if (!s) return mirrorLoad("managers") || [];
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
    const list = (data || []).map((row) => {
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
    mirrorSave("managers", list);
    return list;
  } catch (err) {
    console.error("listManagers failed:", err);
    return mirrorLoad("managers") || []; // v5.13.0: sin conexión, últimos gestores
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
  if (!s) return mirrorLoad("cards") || [];
  try {
    // v5.17: columnas seguras — a anon solo se leen los últimos 4 dígitos
    // (last4, columna generada). El admin ve el número completo con listCardsAdmin.
    const { data, error } = await s.from("cards")
      .select("id, name, bank, active, created_at, initial_balance, balance_currency, last4")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const list = rows(data);
    mirrorSave("cards", list);
    return list;
  } catch { return mirrorLoad("cards") || []; } // v5.13.0: sin conexión, últimas tarjetas
}

/**
 * v5.17: tarjetas COMPLETAS (incluye number) — solo con sesión de admin.
 * Se usa en el editor de tarjetas del panel admin.
 * @returns {Promise<Array>}
 */
export async function listCardsAdmin() {
  const demo = await isDemo();
  if (demo) return DEMO_CARDS;
  const s = await sb();
  if (!s) return listCards();
  try {
    const { data, error } = await s.from("cards").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return rows(data);
  } catch (err) {
    console.warn("listCardsAdmin failed:", err);
    return listCards();
  }
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
/**
 * Tarjetas con saldo calculado. Por defecto NO incluye el número completo
 * (seguro para sesiones PIN/anon). Con { includeNumber: true } devuelve
 * `number` — usar SOLO con sesión de admin.
 * @param {{includeNumber?: boolean}} [opts]
 * @returns {Promise<Array>}
 */
export async function listCardsWithBalances({ includeNumber = false } = {}) {
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
    const cardCols = includeNumber
      ? "id, name, number, bank, active, created_at, initial_balance, balance_currency, last4"
      : "id, name, bank, active, created_at, initial_balance, balance_currency, last4";
    const { data: cards, error: cErr } = await s.from("cards")
      .select(cardCols)
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
export async function recordCardMovementForSale(sale) {
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
    // card_movements.sale_id y .user_id son uuid en la BD; sale.id es "S-..."
    // y sale.userId puede ser "pin-..." → enviar null en vez de romper (22P02).
    r.sale_id = nullIfNotUuid(r.sale_id);
    r.user_id = nullIfNotUuid(r.user_id);
    const { error } = await s.from("card_movements").insert(r);
    if (error) throw error;
  } catch (err) {
    // v5.17: se lanza (antes se tragaba y el movimiento de la tarjeta se
    // perdía sin reintento). saveSale y la cola deciden cómo tratarlo.
    console.error("recordCardMovementForSale failed:", err);
    throw err;
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
  // v5.5.0: rama demo — aplanar DEMO_STOCK con info de almacén/producto
  // (antes devolvía [] sin Supabase y el tab "Otros almacenes" quedaba vacío)
  if (await isDemo()) {
    const whMap = new Map(DEMO_WAREHOUSES.map((w) => [w.id, w]));
    const prodMap = new Map(DEMO_PRODUCTS.map((p) => [p.id, p]));
    return (DEMO_STOCK || [])
      .filter((st) => whMap.has(st.warehouseId) && prodMap.has(st.productId))
      .map((st) => ({
        productId: st.productId,
        warehouseId: st.warehouseId,
        warehouseName: whMap.get(st.warehouseId)?.name,
        warehouseCode: whMap.get(st.warehouseId)?.code,
        quantity: Number(st.quantity) || 0,
        localPrice: st.localPrice ?? null,
      }));
  }
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
// ============ Solicitudes de traspaso (v5.5) ============
// =====================================================
// El empleado de almacén pide mercancía a otro almacén; el admin
// aprueba (mueve stock con TRANSFERENCIA_SALIDA/ENTRADA) o rechaza.
// En demo se persiste en localStorage para poder probar el flujo.

const DEMO_REQUESTS_KEY = "mannol-demo-transfer-requests-v1";
const DEMO_CLOSURES_KEY = "mannol-demo-daily-closures-v1";
// Evento para suscripciones en vivo en modo demo (localStorage no avisa a la misma pestaña)
const DEMO_REQUESTS_EVENT = "mannol-demo-requests-changed";

function readDemoStore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeDemoStore(key, items) {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch {}
}

function emitDemoRequestsChanged() {
  try { window.dispatchEvent(new CustomEvent(DEMO_REQUESTS_EVENT)); } catch {}
}

// Seed demo (una sola vez): 1 solicitud pendiente + 2 cierres recientes
function ensureDemoSeeds() {
  if (!readDemoStore(DEMO_REQUESTS_KEY)) {
    const whFrom = DEMO_WAREHOUSES[1] || DEMO_WAREHOUSES[0];
    const whTo = DEMO_WAREHOUSES[0];
    const prod = DEMO_PRODUCTS[0];
    const now = Date.now();
    writeDemoStore(DEMO_REQUESTS_KEY, [
      {
        id: "demo-req-1",
        code: `TRS-${String(now).slice(-5)}`,
        fromWarehouseId: whFrom?.id || "demo-id",
        fromWarehouseName: whFrom?.name || "",
        toWarehouseId: whTo?.id || "demo-id",
        toWarehouseName: whTo?.name || "",
        productId: prod?.id || "demo-id",
        productName: prod?.name || "Producto",
        quantity: 10,
        note: "Se nos acabó el 5W-30, quedan 2 unidades",
        status: "PENDIENTE",
        requestedBy: "demo-user",
        requestedByName: "Empleado (Víbora)",
        resolvedBy: null,
        resolvedByName: null,
        resolvedAt: null,
        createdAt: now - 3600000,
      },
    ]);
  }
  if (!readDemoStore(DEMO_CLOSURES_KEY)) {
    const wh = DEMO_WAREHOUSES[0];
    const dayMs = 86400000;
    const now = Date.now();
    writeDemoStore(DEMO_CLOSURES_KEY, [0, 1].map((back) => ({
      id: `demo-closure-${back}`,
      warehouseId: wh?.id || "demo-id",
      warehouseCode: wh?.code || "",
      warehouseName: wh?.name || "",
      closureDate: new Date(now - back * dayMs - new Date(now - back * dayMs).getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      salesCount: 12 - back * 3,
      unitsSold: 34 - back * 8,
      totalUSD: 310.5 - back * 72.25,
      byCurrency: {
        USD: { count: 7 - back, amount: 198.5 - back * 45 },
        MN: { count: 4 - back, amount: 3200 - back * 800 },
        EUR: { count: 0, amount: 0 },
        TRANSFERENCIA: { count: 1, amount: 112 - back * 27.25 },
      },
      topProducts: [
        { name: "MANNOL Energy Formula 5W-30", qty: 6, total: 150 },
        { name: "Filtro de Aceite Mannol W712/93", qty: 5, total: 25 },
      ],
      createdBy: "demo-user",
      createdByName: "Empleado",
      createdAt: now - back * dayMs,
    })));
  }
}

/**
 * Crea una solicitud de traspaso (estado inicial PENDIENTE).
 * @param {Object} data - { fromWarehouseId, toWarehouseId, productId, productName, quantity, note }
 * @param {Object} user - { id, displayName } quien la pide
 * @returns {Promise<{id: string, code?: string}>}
 */
export async function createTransferRequest(data, user) {
  const check = validateTransferRequest(data);
  if (!check.ok) throw new Error(check.error);

  const base = {
    code: `TRS-${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 9)}`,
    fromWarehouseId: data.fromWarehouseId,
    toWarehouseId: data.toWarehouseId,
    productId: data.productId,
    productName: data.productName || "",
    quantity: Number(data.quantity),
    note: data.note || null,
    status: "PENDIENTE",
    // v5.20.0: las sesiones PIN tienen id "pin-…" (no es UUID) → antes la
    // base rechazaba la solicitud con «invalid input syntax for type uuid».
    requestedBy: nullIfNotUuid(user?.id),
    requestedByName: user?.displayName || null,
    createdAt: Date.now(),
  };

  const demo = await isDemo();
  if (demo) {
    ensureDemoSeeds();
    const items = readDemoStore(DEMO_REQUESTS_KEY) || [];
    // Regla: máx 1 PENDIENTE por (origen, destino, producto)
    const dup = items.find((r) => r.status === "PENDIENTE" &&
      r.fromWarehouseId === base.fromWarehouseId &&
      r.toWarehouseId === base.toWarehouseId &&
      r.productId === base.productId);
    if (dup) throw new Error("Ya existe una solicitud pendiente de este producto desde ese almacén");
    const rec = { ...base, id: `demo-req-${Date.now()}` };
    items.unshift(rec);
    writeDemoStore(DEMO_REQUESTS_KEY, items);
    emitDemoRequestsChanged();
    return { id: rec.id, code: rec.code };
  }

  const s = await sb();
  if (!s) return { id: "demo-id" };
  try {
    const { data: inserted, error } = await s.from("transfer_requests")
      .insert(toRow(base)).select().single();
    if (error) throw error;
    return { id: inserted.id, code: inserted.code };
  } catch (err) {
    console.error("createTransferRequest failed:", err);
    // Índice único parcial: solicitud duplicada
    if (String(err.code) === "23505" || /duplicate/i.test(err.message || "")) {
      throw new Error("Ya existe una solicitud pendiente de este producto desde ese almacén");
    }
    // v5.20.0: permisos (RLS) — el acceso por PIN es rol anon
    if (String(err.code) === "42501" || /row-level security|permission denied/i.test(err.message || "")) {
      throw new Error("La base de datos no permite solicitudes desde el acceso por PIN. El administrador debe ejecutar supabase/instalar.sql");
    }
    if (!navigator.onLine) throw new Error("Sin conexión: la solicitud necesita internet");
    throw err;
  }
}

/**
 * Lista solicitudes de traspaso (más recientes primero).
 * @param {Object} filters - { status, toWarehouseId, limit }
 * @returns {Promise<Array>}
 */
export async function listTransferRequests(filters = {}) {
  const demo = await isDemo();
  if (demo) {
    ensureDemoSeeds();
    let items = readDemoStore(DEMO_REQUESTS_KEY) || [];
    if (filters.status) items = items.filter((r) => r.status === filters.status);
    if (filters.toWarehouseId) items = items.filter((r) => r.toWarehouseId === filters.toWarehouseId);
    return items.slice(0, filters.limit || 50);
  }
  const s = await sb();
  if (!s) return [];
  try {
    let q = s.from("transfer_requests").select("*");
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.toWarehouseId) q = q.eq("to_warehouse_id", filters.toWarehouseId);
    q = q.order("created_at", { ascending: false }).limit(filters.limit || 50);
    const { data, error } = await q;
    if (error) throw error;
    return rows(data || []);
  } catch (err) {
    console.error("listTransferRequests failed:", err);
    return [];
  }
}

/**
 * Resuelve una solicitud: APROBADA mueve el stock (origen → destino),
 * RECHAZADA/CANCELADA solo cambian el estado. Estados finales cerrados.
 * @param {string} id
 * @param {"APROBADA"|"RECHAZADA"|"CANCELADA"} nextStatus
 * @param {Object} user - { id, displayName } quien resuelve
 */
export async function setTransferRequestStatus(id, nextStatus, user) {
  const demo = await isDemo();
  if (demo) {
    const items = readDemoStore(DEMO_REQUESTS_KEY) || [];
    const rec = items.find((r) => r.id === id);
    if (!rec) throw new Error("Solicitud no encontrada");
    if (!canTransitionRequest(rec.status, nextStatus)) {
      throw new Error(`No se puede pasar de ${rec.status} a ${nextStatus}`);
    }
    rec.status = nextStatus;
    rec.resolvedBy = user?.id || null;
    rec.resolvedByName = user?.displayName || null;
    rec.resolvedAt = Date.now();
    writeDemoStore(DEMO_REQUESTS_KEY, items);
    emitDemoRequestsChanged();
    // En demo no se mueve stock (los stocks demo son de solo lectura)
    return { ...rec };
  }

  const s = await sb();
  if (!s) return null;
  try {
    const { data: req, error: e1 } = await s.from("transfer_requests")
      .select("*").eq("id", id).maybeSingle();
    if (e1) throw e1;
    if (!req) throw new Error("Solicitud no encontrada");
    if (!canTransitionRequest(req.status, nextStatus)) {
      throw new Error(`No se puede pasar de ${req.status} a ${nextStatus}`);
    }

    if (nextStatus === "APROBADA") {
      // Stock: sale del origen, entra al destino (mismo patrón que processStockTransfer)
      await adjustStock(
        req.from_warehouse_id, req.product_id, -req.quantity,
        "TRANSFERENCIA_SALIDA", `Solicitud ${req.code || id} → destino`,
        user?.id, user?.displayName
      );
      await adjustStock(
        req.to_warehouse_id, req.product_id, req.quantity,
        "TRANSFERENCIA_ENTRADA", `Solicitud ${req.code || id} ← origen`,
        user?.id, user?.displayName
      );
    }

    const { error: e2 } = await s.from("transfer_requests").update({
      status: nextStatus,
      resolved_by: user?.id || null,
      resolved_by_name: user?.displayName || null,
      resolved_at: new Date().toISOString(),
    }).eq("id", id);
    if (e2) throw e2;
    return { id, status: nextStatus };
  } catch (err) {
    console.error("setTransferRequestStatus failed:", err);
    throw err;
  }
}

/**
 * Suscripción en vivo a las solicitudes de traspaso (v5.6).
 * Real: Supabase Realtime (postgres_changes sobre transfer_requests).
 * Demo: re-lee localStorage en cada evento mannol-demo-requests-changed
 * (o si otra pestaña cambia la clave — evento storage).
 *
 * @param {(items: Array<Object>) => void} cb
 * @returns {() => void} función para cancelar la suscripción
 */
export function subscribeTransferRequests(cb) {
  let unsub = noopUnsub;
  (async () => {
    const emit = () => { listTransferRequests({ limit: 100 }).then(cb).catch(() => {}); };

    if (await isDemo()) {
      emit();
      const onStorage = (e) => { if (e.key === DEMO_REQUESTS_KEY) emit(); };
      window.addEventListener(DEMO_REQUESTS_EVENT, emit);
      window.addEventListener("storage", onStorage);
      unsub = () => {
        window.removeEventListener(DEMO_REQUESTS_EVENT, emit);
        window.removeEventListener("storage", onStorage);
      };
      return;
    }

    const s = await sb();
    if (!s) return;
    try {
      emit();
      const channel = s.channel("transfer-requests-live");
      channel.on("postgres_changes", { event: "*", schema: "public", table: "transfer_requests" }, emit);
      channel.subscribe();
      // v5.21.0: respaldo si el tiempo real no llega (tabla fuera de la
      // publicación o red inestable): se revisa cada 45 s con la app visible.
      const poll = setInterval(() => {
        if (typeof document === "undefined" || document.visibilityState !== "hidden") emit();
      }, 45000);
      unsub = () => {
        clearInterval(poll);
        try { s.client.removeChannel(channel); } catch {}
      };
    } catch (err) {
      console.error("subscribeTransferRequests failed:", err);
    }
  })();
  return () => unsub();
}

// =====================================================
// ============ Cierre de caja diario (v5.5) ============
// =====================================================

/**
 * Guarda (o actualiza, si ya existía) el cierre del día para un almacén.
 * @param {Object} c - { warehouseId, warehouseCode, warehouseName, dateKey, stats, user }
 * @returns {Promise<{id: string, updated: boolean}>}
 */
export async function saveDailyClosure(c) {
  const payload = {
    warehouseId: c.warehouseId,
    warehouseCode: c.warehouseCode || null,
    warehouseName: c.warehouseName || null,
    closureDate: c.dateKey,
    salesCount: c.stats.salesCount,
    unitsSold: c.stats.unitsSold,
    totalUSD: c.stats.totalUSD,
    byCurrency: c.stats.byCurrency,
    topProducts: c.stats.topProducts,
    createdBy: nullIfNotUuid(c.user?.id), // v5.20.0: sesiones PIN → null
    createdByName: c.user?.displayName || null,
    createdAt: Date.now(),
  };

  const demo = await isDemo();
  if (demo) {
    ensureDemoSeeds();
    const items = readDemoStore(DEMO_CLOSURES_KEY) || [];
    const idx = items.findIndex((x) => x.warehouseId === payload.warehouseId && x.closureDate === payload.closureDate);
    let updated = false;
    if (idx >= 0) { items[idx] = { ...items[idx], ...payload, id: items[idx].id }; updated = true; }
    else items.unshift({ ...payload, id: `demo-closure-${Date.now()}` });
    writeDemoStore(DEMO_CLOSURES_KEY, items);
    return { id: items[0].id, updated };
  }

  const s = await sb();
  if (!s) return { id: "demo-id", updated: false };
  try {
    const { data: existing } = await s.from("daily_closures")
      .select("id").eq("warehouse_id", payload.warehouseId)
      .eq("closure_date", payload.closureDate).maybeSingle();
    const rowPayload = toRow(payload);
    // v5.20.0: camelToSnake convertía totalUSD en "total_u_s_d" (no existe)
    delete rowPayload.total_u_s_d;
    rowPayload.total_usd = payload.totalUSD;
    if (existing?.id) {
      const { error } = await s.from("daily_closures").update(rowPayload).eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id, updated: true };
    }
    const { data: inserted, error } = await s.from("daily_closures").insert(rowPayload).select().single();
    if (error) throw error;
    return { id: inserted.id, updated: false };
  } catch (err) {
    console.error("saveDailyClosure failed:", err);
    throw err;
  }
}

/**
 * Lista cierres diarios (más recientes primero).
 * @param {Object} filters - { warehouseId, fromMs, toMs, limit }
 * @returns {Promise<Array>}
 */
export async function listDailyClosures(filters = {}) {
  const demo = await isDemo();
  if (demo) {
    ensureDemoSeeds();
    let items = readDemoStore(DEMO_CLOSURES_KEY) || [];
    if (filters.warehouseId) items = items.filter((x) => x.warehouseId === filters.warehouseId);
    return items
      .sort((a, b) => String(b.closureDate).localeCompare(String(a.closureDate)))
      .slice(0, filters.limit || 30);
  }
  const s = await sb();
  if (!s) return [];
  try {
    let q = s.from("daily_closures").select("*");
    if (filters.warehouseId) q = q.eq("warehouse_id", filters.warehouseId);
    q = q.order("closure_date", { ascending: false }).limit(filters.limit || 30);
    const { data, error } = await q;
    if (error) throw error;
    // v5.20.0: total_usd → totalUsd; las vistas leen totalUSD
    return rows(data || []).map((c) => ({ ...c, totalUSD: c.totalUSD ?? c.totalUsd ?? 0 }));
  } catch (err) {
    console.error("listDailyClosures failed:", err);
    return [];
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
      "warehouses", "products", "categories", "subcategories", "brands", "managers",
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

// =====================================================
// Offline sync — cola de ventas que sube sola al volver la conexión
// =====================================================
//
// v5.13.0 — TODA venta pasa primero por la cola (js/offline-queue.js):
//   1. Se guarda en el equipo al instante (con o sin internet).
//   2. Si hay conexión, se sube enseguida; si no, espera y se sube sola al
//      volver la conexión (evento "online", al abrir la app, cada 30 s y
//      cuando el service worker lo pide).
//
// SIN MEZCLAR ALMACENES:
//   · Cada venta lleva SU almacén (warehouseId/Code/Name), su código con
//     el prefijo del almacén ("VIB-2QK8ZT7M") y un clientRef (UUID).
//   · Al subir, cada venta va a SU almacén y descuenta SU stock, aunque el
//     equipo se haya usado en varios almacenes o esté conectado a otro.
//   · Una venta hecha con datos de prueba (versiones anteriores abrían sin
//     conexión en "modo demo") NO se sube: queda "para revisar" en vez de
//     subir sin almacén.
//
// SIN DUPLICADOS:
//   · RPC register_sale (migration-v5.13): guarda la venta + descuenta el
//     stock en UNA transacción, idempotente por client_ref. Si la respuesta
//     se pierde y se reintenta, no se duplica ni la venta ni el stock.
//   · Sin la migración: método anterior por fases recordadas (guardada →
//     stock descontado), para no repetir pasos al reintentar.
//
// ORDEN Y CARGA:
//   · Una venta a la vez, en orden; 150 ms entre ventas.
//   · Al reconectar, cada almacén espera 0-3 s (según su id) para no subir
//     todos a la vez. Una venta recién hecha con conexión sube sin espera.
//   · Si falla la red se corta la vuelta y se reintenta con espera
//     creciente (2 s, 4 s, 8 s… máx. 60 s).
//   · Un solo proceso de subida por equipo (Web Locks entre pestañas).
// =====================================================

import { getSupabase, isSupabaseConfiguredAsync } from "./supabase.js";
import {
  saveSale,
  adjustStock,
  deductSaleStockAtomic,
  registerSaleRemote,
  recordCardMovementForSale,
  isUuid,
} from "./db.js";
import { toast } from "./ui.js";
import {
  readQueue,
  addToQueue,
  removeFromQueue,
  updateQueuedSale,
  subscribeQueue,
  markUploaded,
  summarizeQueue,
  pendingForWarehouse,
  stripInternal,
} from "./offline-queue.js";

// ===== UUID v4 generation =====
export function generateClientRef() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {}
  // Fallback manual
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ===== Hash string → number (for staggered delays) =====
function hashString(str) {
  let hash = 0;
  if (!str) return 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Stagger delay: 0-3000ms based on warehouse ID
export function getStaggerDelay(warehouseId) {
  const hash = hashString(warehouseId || "default");
  return hash % 3000;
}

// Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s (max) + jitter
export function getBackoffDelay(attempts) {
  const base = 2000 * Math.pow(2, Math.min(Math.max(attempts - 1, 0), 5));
  const jitter = Math.random() * 1000;
  return Math.min(base + jitter, 60000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

// ===== Clasificación de errores =====

/** ¿Es un fallo de red/servidor (reintentar) y no un error de datos? */
export function isNetworkError(err) {
  if (!err) return false;
  const name = String(err.name || "");
  const msg = `${err.message || ""} ${err.details || ""} ${typeof err === "string" ? err : ""}`;
  if (name === "AbortError" || name === "AuthRetryableFetchError") return true;
  if (/Failed to fetch|NetworkError|Load failed|network ?error|ERR_INTERNET|ERR_CONNECTION|ERR_NAME|ECONNREFUSED|ETIMEDOUT|AbortError|aborted|timeout|fetch failed/i.test(msg)) return true;
  const status = Number(err.status ?? err.statusCode ?? NaN);
  if (status === 0 || (status >= 500 && status < 600)) return true;
  if (/^(08|57P0|53)/.test(String(err.code || ""))) return true; // conexión / servidor ocupado
  return false;
}

// Motivos por los que una venta NO se sube sola (queda "para revisar")
export const BLOCK_REASONS = {
  warehouse_invalid: "Se registró con un almacén de prueba (la app había abierto sin datos reales). No se sube para no mezclarla con otro almacén.",
  products_invalid: "Tiene productos de prueba (la app había abierto sin datos reales). No se puede descontar ese stock.",
  items_empty: "La venta no tiene productos.",
  warehouse_missing: "El almacén de esta venta ya no existe en la nube (¿se borró?). No se sube para no asignarla a otro almacén.",
  sale_invalid: "A la venta le faltan datos (id o referencia). Copia el detalle y regístrala a mano.",
  sync_failed: "El servidor la rechazó varias veces (no fue un problema de red). Copia el detalle y revísala con el administrador.",
};

// v5.17: un error NO de red ya no se reintenta para siempre (2 s…60 s sin
// fin). Tras este número de intentos fallidos, la venta pasa a «para revisar».
export const MAX_SYNC_ATTEMPTS = 10;

/** ¿Toca pasar a «para revisar» tras este intento? (puro, testeado) */
export function shouldBlockAfterAttempt(attempts, isNetwork) {
  if (isNetwork) return false; // sin red: reintentar con espera creciente
  return Number(attempts) >= MAX_SYNC_ATTEMPTS;
}

/**
 * Errores DEFINITIVOS del servidor (migration-v5.13): reintentar no sirve.
 * Devuelve el motivo de bloqueo o null.
 */
export function serverBlockReason(err) {
  const msg = `${err?.message || ""} ${err?.details || ""}`;
  if (/MANNOL_WAREHOUSE_NOT_FOUND/.test(msg)) return "warehouse_missing";
  if (/MANNOL_SALE_INVALID/.test(msg)) return "sale_invalid";
  return null;
}

/**
 * Validación local antes de subir. Devuelve el motivo de bloqueo o null.
 * Solo aplica con Supabase configurado (en modo demo todo vale).
 */
export function validateQueuedSale(sale, { configured = true } = {}) {
  if (!configured) return null;
  if (!isUuid(String(sale?.warehouseId || ""))) return "warehouse_invalid";
  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (items.length === 0) return "items_empty";
  if (items.some((i) => !isUuid(String(i?.productId || i?.product_id || "")))) return "products_invalid";
  return null;
}

// ===== Estado y suscriptores =====
const LAST_OK_KEY = "mannol-sync-last-ok-v1";
let _syncInProgress = false;
let _rerunRequested = false;
const _syncListeners = new Set();
let _retryTimeoutId = null;
let _autoSyncSetup = false;
let _currentSaleId = null;

// Último error de sincronización (visible en el banner para que el
// usuario pueda reportarlo con una captura sin necesitar consola).
// Formato: { code, message, saleCode, warehouseCode, network, at } | null
let _lastSyncError = null;
let _lastSyncOkAt = (() => {
  try { return Number(localStorage.getItem(LAST_OK_KEY)) || null; } catch { return null; }
})();

export function getLastSyncError() {
  return _lastSyncError;
}

export function getLastSyncOkAt() {
  return _lastSyncOkAt;
}

function recordSyncError(err, sale) {
  _lastSyncError = {
    code: err?.code || err?.details?.code || (isNetworkError(err) ? "RED" : "ERROR"),
    message: String(err?.message || err?.details?.message || err || "Error desconocido").slice(0, 140),
    saleCode: sale?.code || "?",
    warehouseCode: sale?.warehouseCode || "",
    network: isNetworkError(err),
    at: Date.now(),
  };
}

export function isSyncing() {
  return _syncInProgress;
}

/** Ventas pendientes (de un almacén, o todas). */
export function getPendingCount(warehouseId = null) {
  return pendingForWarehouse(readQueue(), warehouseId).length;
}

/** Copia de las ventas en cola (sin campos internos salvo estado). */
export function getPendingSales(warehouseId = null) {
  return pendingForWarehouse(readQueue(), warehouseId).map((s) => ({
    ...stripInternal(s),
    blockedReason: s._blocked || null,
    lastError: s._lastError || null,
    attempts: s._syncAttempts || 0,
    queuedAt: s._queuedAt || s.createdAt || null,
    uploading: s.id === _currentSaleId,
  }));
}

/** Resumen por almacén (ver offline-queue.js#summarizeQueue). */
export function getQueueSummary(currentWarehouseId = null) {
  return summarizeQueue(readQueue(), currentWarehouseId);
}

function currentStatus() {
  const queue = readQueue();
  return {
    syncing: _syncInProgress,
    pending: queue.length,
    currentSaleId: _currentSaleId,
    lastError: _lastSyncError,
    lastOkAt: _lastSyncOkAt,
  };
}

export function subscribeSyncStatus(cb) {
  _syncListeners.add(cb);
  try { cb(currentStatus()); } catch {}
  return () => _syncListeners.delete(cb);
}

function notifySyncStatus() {
  const status = currentStatus();
  _syncListeners.forEach((cb) => {
    try { cb(status); } catch {}
  });
}

// Cambios de la cola (esta pestaña u otra) → avisar a los banners
subscribeQueue(() => notifySyncStatus());

// ===== Idempotencia (método anterior): ¿ya existe una venta con este clientRef? =====
// Lanza si falla la red (para NO intentar guardar a ciegas).
async function saleAlreadySynced(clientRef) {
  if (!clientRef) return false;
  const s = await getSupabase();
  if (!s) return false; // demo — nada que comprobar
  const { data, error } = await s.from("sales").select("id").eq("client_ref", clientRef).limit(1);
  if (error) {
    if (isNetworkError(error)) throw error;
    console.warn("[Sync] Idempotency check failed:", error);
    return false; // el índice único de client_ref frena un duplicado igual
  }
  return Array.isArray(data) && data.length > 0;
}

// ===== Método anterior (BD sin migration-v5.13) =====
async function uploadLegacy(sale) {
  let s = sale;
  // Fase 1: guardar la venta (una sola vez)
  if (!s._savedAt) {
    const exists = await saleAlreadySynced(s.clientRef);
    if (!exists) await saveSale(s);
    s = updateQueuedSale(s.id, { _savedAt: Date.now() }) || { ...s, _savedAt: Date.now() };
  }
  // Fase 2: descontar el stock de SU almacén (una sola vez)
  let shortages = [];
  if (s.status === "COMPLETADA" && !s._stockDone) {
    let atomicDone = false;
    try {
      const res = await deductSaleStockAtomic(s);
      atomicDone = true;
      shortages = res?.shortages || [];
    } catch (err) {
      if (err?.code !== "RPC_MISSING") {
        if (isNetworkError(err)) throw err;
        console.warn(`[Sync] deduct_sale_stock falló para ${s.code}, uso el descuento clásico:`, err);
      }
    }
    if (!atomicDone) {
      const done = new Set(s._stockItemsDone || []);
      const items = Array.isArray(s.items) ? s.items : [];
      for (let i = 0; i < items.length; i++) {
        if (done.has(i)) continue;
        const item = items[i];
        try {
          await adjustStock(s.warehouseId, item.productId, -item.quantity, "VENTA", `Venta ${s.code}`, s.userId, s.userName);
        } catch (err) {
          if (isNetworkError(err)) throw err; // se reintenta desde este producto
          // v5.17: antes se marcaba el producto como hecho IGUAL y el stock
          // quedaba sin descontar para siempre. Ahora el error sube: la venta
          // se reintenta (y si el fallo persiste, pasa a «para revisar»).
          throw err;
        }
        done.add(i);
        s = updateQueuedSale(s.id, { _stockItemsDone: [...done] }) || s;
      }
    }
    s = updateQueuedSale(s.id, { _stockDone: true }) || s;
  }
  return { ok: true, duplicate: false, shortages };
}

// ===== Subir UNA venta =====
async function uploadOne(sale, { configured }) {
  if (!configured) return { ok: true, duplicate: false, shortages: [], demo: true }; // modo demo
  // Configurado pero sin cliente (librería sin cargar): NO dar la venta por
  // subida — antes saveSale() no hacía nada y la venta salía de la cola.
  const client = await getSupabase();
  if (!client) {
    const e = new Error("No se pudo preparar la conexión con la nube");
    e.code = "SIN_CLIENTE";
    e.status = 0; // se trata como fallo de red → reintento
    throw e;
  }
  // RPC atómica + idempotente (migration-v5.13)
  if (!sale._savedAt) {
    try {
      const res = await registerSaleRemote(sale, { timeoutMs: 20000 });
      if (!res?.duplicate) {
        // v5.17: el movimiento de la tarjeta ya no se traga con un catch {} —
        // se reintenta unas veces y, si no se logra, queda registrado en el
        // error de sincronización (visible en el banner) en vez de perderse.
        await recordCardMovementWithRetry(sale);
      }
      return { ok: true, duplicate: !!res?.duplicate, shortages: res?.shortages || [] };
    } catch (err) {
      if (err?.code !== "RPC_MISSING") throw err;
    }
  }
  return uploadLegacy(sale);
}

// v5.17: movimiento de tarjeta con reintentos cortos (solo si falla la red);
// si sigue fallando, se avisa sin descartar la venta ya subida.
async function recordCardMovementWithRetry(sale, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      await recordCardMovementForSale(sale);
      return true;
    } catch (err) {
      console.warn(`[Sync] Movimiento de tarjeta de ${sale.code} falló (intento ${i}/${tries}):`, err?.message || err);
      if (i === tries) {
        recordSyncError(err, sale);
        return false; // la venta YA está subida: no se pierde, solo se avisa
      }
      await sleep(800 * i);
    }
  }
  return false;
}

// ===== Main sync function =====
export async function syncOfflineQueue(options = {}) {
  const { silent = false, manual = false, immediate = false } = options;

  if (_syncInProgress) {
    _rerunRequested = true; // al terminar la vuelta actual se sube lo nuevo
    return { skipped: true, reason: "already_syncing" };
  }

  const initial = readQueue();
  if (initial.length === 0) {
    if (manual) toast("No hay ventas pendientes", "info");
    return { ok: true, synced: 0, failed: 0, skipped: 0, blocked: 0 };
  }
  if (!initial.some((s) => !s._blocked)) {
    if (manual) toast("Las ventas pendientes necesitan revisión (toca «Ver»)", "warning");
    return { ok: true, synced: 0, failed: 0, skipped: 0, blocked: initial.length };
  }

  if (!isOnline()) {
    if (manual) toast("Sin conexión — las ventas se subirán solas al recuperar internet", "warning");
    return { skipped: true, reason: "offline" };
  }

  const run = () => runSync({ silent, manual, immediate });
  // Un solo proceso de subida aunque haya varias pestañas abiertas
  try {
    if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
      return await navigator.locks.request("mannol-sync-ventas", { ifAvailable: true }, async (lock) => {
        if (!lock) return { skipped: true, reason: "other_tab" };
        return run();
      });
    }
  } catch (err) {
    console.warn("[Sync] Web Locks no disponible:", err);
  }
  return run();
}

async function runSync({ silent, manual, immediate }) {
  _syncInProgress = true;
  _rerunRequested = false;
  notifySyncStatus();

  let configured = true;
  try { configured = await isSupabaseConfiguredAsync(); } catch {}

  const startQueue = readQueue().filter((s) => !s._blocked);
  if (!silent && startQueue.length > 1) {
    toast(`Subiendo ${startQueue.length} ventas pendientes...`, "info");
  }
  console.info(`[Sync] Starting sync of ${startQueue.length} sale(s)`);

  // ===== STAGGERED DELAY (solo al reconectar / al abrir) =====
  if (!immediate && !manual) {
    const firstSale = startQueue[0];
    const staggerDelay = getStaggerDelay(firstSale?.warehouseId);
    if (staggerDelay > 0) {
      console.info(`[Sync] Staggering start by ${staggerDelay}ms (warehouse=${firstSale?.warehouseCode || firstSale?.warehouseId})`);
      await sleep(staggerDelay);
    }
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let blocked = 0;
  let maxAttempts = 0;
  let networkDown = false;
  const attempted = new Set();
  const uploadedCodes = [];

  // ===== SEQUENTIAL PROCESSING (lee la cola viva: entra lo que se venda mientras tanto) =====
  try {
    while (true) {
      const sale = readQueue().find((s) => !attempted.has(s.id) && !s._blocked);
      if (!sale) break;
      attempted.add(sale.id);

      // Ventas de la cola de versiones anteriores sin clientRef: se le asigna
      // uno y se GUARDA antes de subir → los reintentos usan siempre el mismo.
      if (!sale.clientRef) {
        sale.clientRef = generateClientRef();
        updateQueuedSale(sale.id, { clientRef: sale.clientRef });
      }

      const reason = validateQueuedSale(sale, { configured });
      if (reason) {
        updateQueuedSale(sale.id, { _blocked: reason, _blockedAt: Date.now() });
        blocked++;
        console.warn(`[Sync] Venta ${sale.code} bloqueada (${reason}) — no se sube`);
        continue;
      }

      _currentSaleId = sale.id;
      notifySyncStatus();
      try {
        console.info(`[Sync] Subiendo ${sale.code} → almacén ${sale.warehouseCode || sale.warehouseId}`);
        const result = await uploadOne(sale, { configured });
        removeFromQueue(sale.id);
        markUploaded(sale.clientRef);
        if (result.duplicate) skipped++;
        else synced++;
        uploadedCodes.push(sale.code);
        const shortages = result.shortages || [];
        if (shortages.length > 0) {
          console.warn(`[Sync] ${sale.code}: stock insuficiente al subir:`, shortages);
          toast(
            `Venta ${sale.code} subida con revisión: stock insuficiente en ${shortages.length} producto(s). Revisa Stock general.`,
            "warning",
            7000,
          );
        }
      } catch (err) {
        const definitive = serverBlockReason(err);
        if (definitive) {
          // El servidor la rechaza para siempre: "para revisar", sin reintentos
          console.warn(`[Sync] Venta ${sale.code} rechazada por la nube (${definitive}) — queda para revisar`);
          updateQueuedSale(sale.id, {
            _blocked: definitive,
            _blockedAt: Date.now(),
            _lastError: { code: err?.code || "P0001", message: String(err?.message || "").slice(0, 140), network: false },
          });
          blocked++;
          continue;
        }
        console.error(`[Sync] Failed to sync sale ${sale.code}:`, err);
        recordSyncError(err, sale);
        failed++;
        const network = isNetworkError(err);
        const attempts = (sale._syncAttempts || 0) + 1;
        maxAttempts = Math.max(maxAttempts, attempts);
        // v5.17: un rechazo que NO es de red (datos, permisos, RPC ausente…)
        // ya no se reintenta para siempre: tras MAX_SYNC_ATTEMPTS pasa a
        // «para revisar» con su motivo visible.
        if (shouldBlockAfterAttempt(attempts, network)) {
          console.warn(`[Sync] Venta ${sale.code} agotó ${attempts} intentos (error no de red) — queda para revisar`);
          updateQueuedSale(sale.id, {
            _syncAttempts: attempts,
            _lastAttemptAt: Date.now(),
            _blocked: "sync_failed",
            _blockedAt: Date.now(),
            _lastError: { code: _lastSyncError.code, message: _lastSyncError.message, network: false },
          });
          blocked++;
          continue;
        }
        updateQueuedSale(sale.id, {
          _syncAttempts: attempts,
          _lastAttemptAt: Date.now(),
          _lastError: { code: _lastSyncError.code, message: _lastSyncError.message, network: _lastSyncError.network },
        });
        if (network) {
          networkDown = true;
          break; // sin red no tiene sentido seguir con las demás
        }
      } finally {
        _currentSaleId = null;
      }

      await sleep(150);
    }
  } finally {
    _syncInProgress = false;
  }

  if (failed === 0) _lastSyncError = null;
  if (synced + skipped > 0) {
    _lastSyncOkAt = Date.now();
    try { localStorage.setItem(LAST_OK_KEY, String(_lastSyncOkAt)); } catch {}
  }
  notifySyncStatus();

  const summary = { ok: failed === 0, synced, failed, skipped, blocked, total: attempted.size };
  console.info(`[Sync] Done: ${synced} synced, ${skipped} skipped, ${failed} failed, ${blocked} blocked`, summary);

  // ===== Avisos =====
  if (blocked > 0) {
    toast(`${blocked} venta(s) quedaron «para revisar» y no se subieron. Toca «Ver» en el aviso de ventas pendientes.`, "warning", 8000);
  }
  if (!silent || manual) {
    if (failed === 0) {
      if (synced === 1 && skipped === 0) toast(`Venta ${uploadedCodes[0]} subida a la nube`, "success");
      else if (synced > 0) toast(`${synced} venta(s) subida(s)${skipped > 0 ? `, ${skipped} ya estaban` : ""}`, "success");
      else if (skipped > 0) toast(`${skipped} venta(s) ya estaban subidas`, "info");
    } else if (networkDown) {
      toast(`Sin conexión estable: ${synced > 0 ? `${synced} subida(s), ` : ""}el resto se subirá sola${failed > 1 ? "s" : ""} al volver internet`, "warning");
    } else {
      toast(`${synced} subidas, ${failed} con error — se reintentarán automáticamente`, "warning");
    }
  } else if (synced > 0 && !immediate) {
    // Subida automática al reconectar: avisar aunque sea "silenciosa"
    toast(synced === 1 ? `Venta ${uploadedCodes[0]} subida a la nube` : `${synced} ventas pendientes subidas a la nube`, "success");
  }

  // ===== EXPONENTIAL BACKOFF =====
  if (failed > 0) scheduleRetry(maxAttempts);

  // Ventas registradas mientras se subía → otra vuelta enseguida
  if (_rerunRequested || readQueue().some((s) => !s._blocked && !attempted.has(s.id))) {
    _rerunRequested = false;
    if (!networkDown) setTimeout(() => { syncOfflineQueue({ silent: true, immediate: true }); }, 300);
  }

  return summary;
}

function scheduleRetry(attempts) {
  if (!isOnline()) return; // el evento "online" lo dispara al volver
  const delay = getBackoffDelay(attempts);
  console.info(`[Sync] Reintento en ${Math.round(delay / 1000)}s (intento ${attempts})`);
  if (_retryTimeoutId) clearTimeout(_retryTimeoutId);
  _retryTimeoutId = setTimeout(() => {
    _retryTimeoutId = null;
    syncOfflineQueue({ silent: true });
  }, delay);
}

// ===== Setup auto-sync on reconnect =====
export function setupAutoSync() {
  if (_autoSyncSetup) return;
  _autoSyncSetup = true;

  // Listen for 'online' event → trigger sync
  window.addEventListener("online", () => {
    console.info("[Sync] Connection restored — triggering sync in 1s");
    if (_retryTimeoutId) { clearTimeout(_retryTimeoutId); _retryTimeoutId = null; }
    setTimeout(() => { syncOfflineQueue({ silent: true }); }, 1000);
  });
  window.addEventListener("offline", () => notifySyncStatus());

  // On app start, if online and queue has items, sync after 2s
  if (isOnline()) {
    const queue = readQueue();
    if (queue.some((s) => !s._blocked)) {
      console.info(`[Sync] App started with ${queue.length} pending sale(s) — will sync in 2s`);
      setTimeout(() => { syncOfflineQueue({ silent: true }); }, 2000);
    }
  }

  // Listen for SW messages (Background Sync API)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "flush-queue" || event.data?.type === "retry-sync") {
        console.info("[Sync] SW requested sync");
        syncOfflineQueue({ silent: true });
      }
    });
  }

  // Periodic check every 30s (in case online event was missed)
  setInterval(() => {
    if (isOnline() && !_syncInProgress && !_retryTimeoutId) {
      const queue = readQueue();
      if (queue.some((s) => !s._blocked)) {
        console.info(`[Sync] Periodic check found ${queue.length} pending sale(s)`);
        syncOfflineQueue({ silent: true });
      }
    }
  }, 30000);
}

// ===== Manual sync trigger (for UI button) =====
export function manualSync() {
  if (_retryTimeoutId) { clearTimeout(_retryTimeoutId); _retryTimeoutId = null; }
  return syncOfflineQueue({ silent: false, manual: true });
}

/** Pide subir YA (venta recién registrada con conexión): sin espera escalonada. */
export function requestSync() {
  if (!isOnline()) return Promise.resolve({ skipped: true, reason: "offline" });
  return syncOfflineQueue({ silent: true, immediate: true });
}

// ===== Enqueue a sale for offline sync =====
export function enqueueSale(sale) {
  // Ensure sale has clientRef for idempotency
  if (!sale.clientRef) {
    sale.clientRef = generateClientRef();
  }
  // Ensure sale has _syncAttempts
  if (!sale._syncAttempts) {
    sale._syncAttempts = 0;
  }
  addToQueue(sale); // lanza si el equipo no tiene espacio (el que llama avisa)
  console.info(`[Sync] Sale ${sale.code} enqueued → ${sale.warehouseCode || sale.warehouseId} (clientRef=${sale.clientRef.substring(0, 8)}...)`);
  notifySyncStatus();
  return sale;
}

/**
 * Quitar de la cola una venta "para revisar" (hecha con datos de prueba).
 * Solo se permite para ventas bloqueadas: las normales siempre se suben.
 */
export function discardBlockedSale(id) {
  const sale = readQueue().find((s) => s.id === id);
  if (!sale || !sale._blocked) return false;
  removeFromQueue(id);
  notifySyncStatus();
  return true;
}

/**
 * v5.17: retirar del equipo una venta NORMAL que aún no se subió (botón
 * «Deshacer» del ticket). No se permite mientras se está subiendo ahora
 * mismo: en ese caso la venta ya salió de manos del vendedor.
 * @param {string} id
 * @returns {boolean}
 */
export function discardQueuedSale(id) {
  const sale = readQueue().find((s) => s.id === id);
  if (!sale) return false;
  if (sale.id === _currentSaleId) return false; // subiéndose ahora mismo
  removeFromQueue(id);
  notifySyncStatus();
  console.info(`[Sync] Venta ${sale.code} retirada de la cola (deshacer)`);
  return true;
}

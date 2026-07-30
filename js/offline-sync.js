// =====================================================
// Offline sync — robust queue with idempotency + staggered delays
// =====================================================
//
// PROBLEMA: Si varios almacenes están offline y recuperan
// conexión al mismo tiempo, todas las ventas se subirían a la
// vez, causando:
//   - Duplicados (si el usuario reintentó)
//   - Carreras en el descuento de stock
//   - Sobrecarga de Firestore
//
// SOLUCIÓN:
//   1. IDEMPOTENCIA: Cada venta tiene un `clientRef` (UUID v4).
//      Antes de guardar, se verifica si ya existe una venta con
//      ese clientRef. Si existe, se omite (no se duplica).
//
//   2. STAGGERED DELAY: Cada almacén espera un tiempo aleatorio
//      (0-3s) basado en el hash de su ID antes de empezar a
//      sincronizar. Esto distribuye la carga.
//
//   3. SEQUENTIAL PROCESSING: Las ventas se procesan una a una
//      (no en paralelo) para evitar carreras en el stock dentro
//      del mismo cliente.
//
//   4. EXPONENTIAL BACKOFF: Si una venta falla, se reintenta con
//      delays crecientes (1s, 2s, 4s, 8s... hasta 60s) + jitter.
//
//   5. SYNC LOCK: Un flag impide que múltiples loops de sync
//      se ejecuten simultáneamente.
//
//   6. SMALL DELAY BETWEEN SALES: 200ms entre cada venta para
//      no saturar Firestore.
// =====================================================

import { getStore } from "./store.js";
import { getFirebase } from "./firebase.js";
import { saveSale, adjustStock } from "./firestore.js";
import { toast } from "./ui.js";

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
function getStaggerDelay(warehouseId) {
  const hash = hashString(warehouseId || "default");
  return hash % 3000;
}

// Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s (max) + jitter
function getBackoffDelay(attempts) {
  const base = 2000 * Math.pow(2, Math.min(attempts, 5));
  const jitter = Math.random() * 1000;
  return Math.min(base + jitter, 60000);
}

// ===== Sync lock + status subscribers =====
let _syncInProgress = false;
let _syncListeners = new Set();
let _retryTimeoutId = null;
let _autoSyncSetup = false;

export function isSyncing() {
  return _syncInProgress;
}

export function getPendingCount() {
  return getStore().getState().offlineQueue.length;
}

export function subscribeSyncStatus(cb) {
  _syncListeners.add(cb);
  cb({ syncing: _syncInProgress, pending: getPendingCount() });
  return () => _syncListeners.delete(cb);
}

function notifySyncStatus() {
  const pending = getPendingCount();
  const status = { syncing: _syncInProgress, pending };
  _syncListeners.forEach((cb) => {
    try { cb(status); } catch {}
  });
}

// ===== Idempotency check: does a sale with this clientRef exist? =====
async function saleAlreadySynced(clientRef) {
  if (!clientRef) return false;
  const f = await getFirebase();
  if (!f) return false; // demo mode — nothing to check
  try {
    const q = f.query(f.collection(f.db, "sales"), f.where("clientRef", "==", clientRef));
    const snap = await f.getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn("[Sync] Idempotency check failed:", err);
    return false; // if check fails, try to save anyway (worst case: duplicate)
  }
}

// ===== Sync a single sale (with idempotency) =====
async function syncOneSale(sale) {
  // 1. Idempotency check
  if (sale.clientRef) {
    const exists = await saleAlreadySynced(sale.clientRef);
    if (exists) {
      console.info(`[Sync] Sale ${sale.code} (clientRef=${sale.clientRef.substring(0, 8)}...) already synced — skipping`);
      return { ok: true, skipped: true };
    }
  }

  // 2. Save the sale document
  await saveSale(sale);

  // 3. Deduct stock for each item (only if COMPLETADA)
  //    Sequential per sale to avoid race within the same sale
  if (sale.status === "COMPLETADA") {
    for (const item of sale.items) {
      try {
        await adjustStock(
          sale.warehouseId,
          item.productId,
          -item.quantity,
          "VENTA",
          `Venta ${sale.code}${sale.clientRef ? ` (sync)` : ""}`,
          sale.userId,
          sale.userName,
        );
      } catch (err) {
        console.warn(`[Sync] Stock adjust failed for ${item.productId} in sale ${sale.code}:`, err);
        // Continue — sale is saved, stock may need manual adjustment
        // We don't fail the whole sync because of one stock issue
      }
    }
  }

  return { ok: true, skipped: false };
}

// ===== Main sync function =====
export async function syncOfflineQueue(options = {}) {
  const { silent = false, manual = false } = options;

  if (_syncInProgress) {
    console.info("[Sync] Already in progress — skipping");
    return { skipped: true, reason: "already_syncing" };
  }

  const store = getStore();
  const queue = [...store.getState().offlineQueue];

  if (queue.length === 0) {
    if (manual) toast("No hay ventas pendientes", "info");
    return { ok: true, synced: 0, failed: 0, skipped: 0 };
  }

  // Check if online
  if (!navigator.onLine) {
    if (manual) toast("Sin conexión — las ventas se sincronizarán al recuperar internet", "warning");
    return { skipped: true, reason: "offline" };
  }

  _syncInProgress = true;
  notifySyncStatus();

  if (!silent) {
    toast(`Sincronizando ${queue.length} venta(s)...`, "info");
  }

  console.info(`[Sync] Starting sync of ${queue.length} sale(s)`);

  // ===== STAGGERED DELAY =====
  // Wait a random time based on the first sale's warehouse ID
  // to avoid all warehouses syncing at the exact same moment
  const firstSale = queue[0];
  const staggerDelay = getStaggerDelay(firstSale?.warehouseId);
  if (staggerDelay > 0) {
    console.info(`[Sync] Staggering start by ${staggerDelay}ms (warehouse=${firstSale?.warehouseId})`);
    await new Promise((r) => setTimeout(r, staggerDelay));
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const failedIds = [];

  // ===== SEQUENTIAL PROCESSING =====
  // Process one sale at a time (not Promise.all) to:
  //   - Avoid stock race conditions within the same warehouse
  //   - Allow idempotency check to see previous saves
  //   - Not overload Firestore with concurrent writes
  for (let i = 0; i < queue.length; i++) {
    const sale = queue[i];
    try {
      console.info(`[Sync] Processing sale ${i + 1}/${queue.length}: ${sale.code}`);
      const result = await syncOneSale(sale);
      if (result.skipped) {
        skipped++;
        console.info(`[Sync] Sale ${sale.code} skipped (already synced)`);
      } else {
        synced++;
        console.info(`[Sync] Sale ${sale.code} synced OK`);
      }
      // Remove from queue on success
      store.dequeueOfflineSale(sale.id);
    } catch (err) {
      console.error(`[Sync] Failed to sync sale ${sale.code}:`, err);
      failed++;
      failedIds.push(sale.id);
      // Sale stays in queue for next retry
    }

    // Small delay between sales (200ms) to not saturate Firestore
    if (i < queue.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  _syncInProgress = false;
  notifySyncStatus();

  // ===== Result feedback =====
  const summary = {
    ok: failed === 0,
    synced,
    failed,
    skipped,
    total: queue.length,
  };

  console.info(`[Sync] Done: ${synced} synced, ${skipped} skipped, ${failed} failed`, summary);

  if (!silent) {
    if (failed === 0) {
      if (synced > 0) {
        toast(
          `${synced} venta(s) sincronizada(s)${skipped > 0 ? `, ${skipped} ya estaban` : ""}`,
          "success",
        );
      } else if (skipped > 0) {
        toast(`${skipped} venta(s) ya estaban sincronizadas`, "info");
      }
    } else {
      toast(
        `${synced} sincronizadas, ${failed} fallaron — se reintentarán automáticamente`,
        "warning",
      );
    }
  }

  // ===== EXPONENTIAL BACKOFF for failed sales =====
  if (failed > 0 && navigator.onLine) {
    const attempts = (queue[0]?._syncAttempts || 0) + 1;
    // Increment attempt counter on failed sales
    for (const id of failedIds) {
      const sale = store.getState().offlineQueue.find((s) => s.id === id);
      if (sale) {
        sale._syncAttempts = (sale._syncAttempts || 0) + 1;
      }
    }
    // Persist updated queue
    store.setState({ offlineQueue: [...store.getState().offlineQueue] });

    const delay = getBackoffDelay(attempts);
    console.info(`[Sync] Retrying ${failed} failed sale(s) in ${Math.round(delay / 1000)}s (attempt ${attempts})`);
    if (_retryTimeoutId) clearTimeout(_retryTimeoutId);
    _retryTimeoutId = setTimeout(() => {
      _retryTimeoutId = null;
      syncOfflineQueue({ silent: true });
    }, delay);
  }

  return summary;
}

// ===== Setup auto-sync on reconnect =====
export function setupAutoSync() {
  if (_autoSyncSetup) return;
  _autoSyncSetup = true;

  // Listen for 'online' event → trigger sync
  window.addEventListener("online", () => {
    console.info("[Sync] Connection restored — triggering sync in 1s");
    // Small delay to let connection stabilize
    setTimeout(() => {
      syncOfflineQueue({ silent: false });
    }, 1000);
  });

  // On app start, if online and queue has items, sync after 2s
  if (navigator.onLine) {
    const queue = getStore().getState().offlineQueue;
    if (queue.length > 0) {
      console.info(`[Sync] App started with ${queue.length} pending sale(s) — will sync in 2s`);
      setTimeout(() => {
        syncOfflineQueue({ silent: false });
      }, 2000);
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
    if (navigator.onLine && !_syncInProgress) {
      const queue = getStore().getState().offlineQueue;
      if (queue.length > 0) {
        console.info(`[Sync] Periodic check found ${queue.length} pending sale(s)`);
        syncOfflineQueue({ silent: true });
      }
    }
  }, 30000);
}

// ===== Manual sync trigger (for UI button) =====
export function manualSync() {
  return syncOfflineQueue({ silent: false, manual: true });
}

// ===== Enqueue a sale for offline sync =====
export function enqueueSale(sale) {
  const store = getStore();
  // Ensure sale has clientRef for idempotency
  if (!sale.clientRef) {
    sale.clientRef = generateClientRef();
  }
  // Ensure sale has _syncAttempts
  if (!sale._syncAttempts) {
    sale._syncAttempts = 0;
  }
  store.enqueueOfflineSale(sale);
  console.info(`[Sync] Sale ${sale.code} enqueued (clientRef=${sale.clientRef.substring(0, 8)}...)`);
  notifySyncStatus();
  return sale;
}

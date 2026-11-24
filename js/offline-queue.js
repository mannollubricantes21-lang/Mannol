// =====================================================
// Cola de ventas sin conexión (v5.13.0)
// =====================================================
// Fuente ÚNICA de las ventas que esperan subir a la nube.
//
//  · Se guarda en su PROPIA clave de localStorage. Antes iba dentro del
//    estado general (almacen-pos-state-v1) y cualquier otro guardado de
//    la app —o una segunda pestaña— podía pisar la cola y perder ventas.
//  · Cada operación relee el almacenamiento antes de escribir.
//  · Cada venta conserva SU almacén (warehouseId/Code/Name) y su clientRef
//    (UUID): al subir, cada una va a su almacén; nunca se mezcla con las
//    ventas de otros almacenes aunque el equipo se haya usado en varios.
//  · No se descartan ventas viejas por tope (antes se tiraban las más
//    antiguas al pasar de 500).
//  · Funciones puras (testeables) para: resumen por almacén, stock que
//    descuenta las ventas pendientes DEL MISMO almacén, y mezclar las
//    pendientes en las listas de ventas.
//
// Este módulo NO depende de db.js (db.js lo importa para mezclar datos).
// =====================================================

export const QUEUE_KEY = "mannol-offline-queue-v2";
export const UPLOADED_KEY = "mannol-offline-uploaded-v1";
export const LEGACY_STATE_KEY = "almacen-pos-state-v1";
const UPLOADED_MAX = 600; // clientRefs recordados como "ya subidos"

let _memoryQueue = null; // respaldo si localStorage no existe (tests / modo privado)
let _memoryUploaded = null;
const _listeners = new Set();

function ls() {
  try {
    return typeof localStorage !== "undefined" && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

function parseList(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && x.id) : [];
  } catch {
    return [];
  }
}

// ===== Lectura / escritura =====

/** Lista actual de ventas en cola (copia fresca del almacenamiento). */
export function readQueue() {
  const s = ls();
  if (!s) return _memoryQueue ? _memoryQueue.map((x) => ({ ...x })) : [];
  return parseList(s.getItem(QUEUE_KEY));
}

function writeQueue(list) {
  const s = ls();
  if (!s) {
    _memoryQueue = list.map((x) => ({ ...x }));
  } else {
    // Puede lanzar QuotaExceededError: el que llama decide cómo avisar.
    s.setItem(QUEUE_KEY, JSON.stringify(list));
  }
  notify();
}

function readUploaded() {
  const s = ls();
  if (!s) return _memoryUploaded ? [..._memoryUploaded] : [];
  try {
    const v = JSON.parse(s.getItem(UPLOADED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** ¿Esta venta (por clientRef) ya se subió desde este equipo? */
export function wasUploaded(clientRef) {
  if (!clientRef) return false;
  return readUploaded().includes(clientRef);
}

/** Recordar que una venta ya subió (evita re-encolarla desde copias viejas). */
export function markUploaded(clientRef) {
  if (!clientRef) return;
  const list = readUploaded().filter((x) => x !== clientRef);
  list.push(clientRef);
  const trimmed = list.slice(-UPLOADED_MAX);
  const s = ls();
  if (!s) {
    _memoryUploaded = trimmed;
    return;
  }
  try {
    s.setItem(UPLOADED_KEY, JSON.stringify(trimmed));
  } catch {}
}

/**
 * Agrega una venta a la cola. Devuelve false si ya estaba (mismo id o
 * mismo clientRef) o si ya se subió antes. Lanza si no hay espacio.
 */
export function addToQueue(sale) {
  if (!sale || !sale.id) throw new Error("Venta sin id");
  const list = readQueue();
  if (list.some((s) => s.id === sale.id || (sale.clientRef && s.clientRef === sale.clientRef))) return false;
  if (sale.clientRef && wasUploaded(sale.clientRef)) return false;
  list.push({ ...sale, _queuedAt: sale._queuedAt || Date.now() });
  writeQueue(list);
  return true;
}

/** Quita una venta de la cola (por id). */
export function removeFromQueue(id) {
  const list = readQueue();
  const next = list.filter((s) => s.id !== id);
  if (next.length !== list.length) writeQueue(next);
  return next.length !== list.length;
}

/** Actualiza campos de una venta en cola. Devuelve la venta actualizada o null. */
export function updateQueuedSale(id, patch) {
  const list = readQueue();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch };
  try {
    writeQueue(list);
  } catch (err) {
    console.warn("[Cola] No se pudo guardar el estado de la venta:", err);
  }
  return { ...list[i] };
}

/**
 * Migración única: las versiones anteriores guardaban la cola dentro del
 * estado general. store.js llama a esto al cargar, ANTES de reescribir ese
 * estado, así ninguna venta pendiente se pierde.
 * @returns {number} ventas importadas
 */
export function importLegacyQueue(legacyList) {
  if (!Array.isArray(legacyList) || legacyList.length === 0) return 0;
  const list = readQueue();
  const ids = new Set(list.map((s) => s.id));
  const refs = new Set(list.map((s) => s.clientRef).filter(Boolean));
  let added = 0;
  for (const sale of legacyList) {
    if (!sale || typeof sale !== "object" || !sale.id) continue;
    if (ids.has(sale.id) || (sale.clientRef && (refs.has(sale.clientRef) || wasUploaded(sale.clientRef)))) continue;
    list.push({ ...sale, _queuedAt: sale._queuedAt || sale.createdAt || Date.now(), _migrated: true });
    ids.add(sale.id);
    if (sale.clientRef) refs.add(sale.clientRef);
    added++;
  }
  if (added > 0) writeQueue(list);
  return added;
}

// ===== Suscripción (misma pestaña + otras pestañas) =====

export function subscribeQueue(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function notify() {
  if (_listeners.size === 0) return;
  const q = readQueue();
  _listeners.forEach((cb) => {
    try {
      cb(q);
    } catch (err) {
      console.warn("[Cola] listener falló:", err);
    }
  });
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === QUEUE_KEY) notify();
  });
}

// =====================================================
// Funciones puras (reciben la cola como parámetro)
// =====================================================

/** Quita los campos internos (_syncAttempts, _lastError...) para mostrar. */
export function stripInternal(sale) {
  const out = {};
  for (const [k, v] of Object.entries(sale || {})) {
    if (!k.startsWith("_")) out[k] = v;
  }
  return out;
}

/** Ventas en cola de UN almacén (o todas si no se indica). */
export function pendingForWarehouse(queue, warehouseId) {
  const q = Array.isArray(queue) ? queue : [];
  return warehouseId ? q.filter((s) => s.warehouseId === warehouseId) : [...q];
}

/**
 * Resumen de la cola agrupado por almacén.
 * `mine` = ventas del almacén actual; `others` = grupos de OTROS almacenes
 * (cada grupo se sube a su propio almacén).
 */
export function summarizeQueue(queue, currentWarehouseId = null) {
  const q = Array.isArray(queue) ? queue : [];
  const groups = new Map();
  let blocked = 0;
  let failing = 0;
  for (const s of q) {
    const key = s.warehouseId || "?";
    let g = groups.get(key);
    if (!g) {
      g = {
        warehouseId: s.warehouseId || null,
        warehouseCode: s.warehouseCode || "?",
        warehouseName: s.warehouseName || "",
        count: 0,
        blocked: 0,
        totalUSD: 0,
        oldestAt: null,
      };
      groups.set(key, g);
    }
    g.count++;
    g.totalUSD += Number(s.totalUSD ?? s.totalAmount ?? 0) || 0;
    const at = s.createdAt || s._queuedAt || null;
    if (at && (!g.oldestAt || at < g.oldestAt)) g.oldestAt = at;
    if (s._blocked) {
      g.blocked++;
      blocked++;
    } else if (s._lastError) {
      failing++;
    }
  }
  const list = [...groups.values()].sort((a, b) => String(a.warehouseCode).localeCompare(String(b.warehouseCode)));
  const mineGroup = currentWarehouseId ? groups.get(currentWarehouseId) : null;
  const others = currentWarehouseId ? list.filter((g) => g.warehouseId !== currentWarehouseId) : [];
  return {
    total: q.length,
    mine: currentWarehouseId ? (mineGroup ? mineGroup.count : 0) : q.length,
    others,
    othersCount: others.reduce((a, g) => a + g.count, 0),
    blocked,
    failing,
    groups: list,
  };
}

/**
 * Unidades vendidas sin subir, por producto, SOLO del almacén indicado.
 * @returns {Map<string, number>}
 */
export function pendingQuantities(queue, warehouseId) {
  const map = new Map();
  if (!warehouseId) return map;
  for (const s of Array.isArray(queue) ? queue : []) {
    if (s.warehouseId !== warehouseId) continue; // nunca descontar ventas de otro almacén
    if (s._blocked) continue;
    if (s.status && s.status !== "COMPLETADA") continue;
    for (const it of Array.isArray(s.items) ? s.items : []) {
      const pid = it.productId || it.product_id;
      const qty = Number(it.quantity) || 0;
      if (!pid || qty <= 0) continue;
      map.set(pid, (map.get(pid) || 0) + qty);
    }
  }
  return map;
}

/**
 * Stock "a la vista" = stock guardado − ventas pendientes del mismo almacén.
 * Marca `pendingQty` en las filas afectadas. No baja de 0.
 */
export function applyPendingToStock(rows, queue, warehouseId) {
  if (!Array.isArray(rows) || !warehouseId) return rows;
  const pend = pendingQuantities(queue, warehouseId);
  if (pend.size === 0) return rows;
  return rows.map((r) => {
    if (!r || (r.warehouseId && r.warehouseId !== warehouseId)) return r;
    const p = pend.get(r.productId);
    if (!p) return r;
    return { ...r, quantity: Math.max(0, (Number(r.quantity) || 0) - p), pendingQty: p };
  });
}

/** ¿La venta cumple los filtros de listSales/subscribeSales? */
export function saleMatchesFilters(sale, filters = {}) {
  const f = filters || {};
  if (f.warehouseId && sale.warehouseId !== f.warehouseId) return false;
  if (f.userId && sale.userId !== f.userId) return false;
  if (f.managerId && sale.managerId !== f.managerId) return false;
  if (f.status && sale.status !== f.status) return false;
  if (f.from && (sale.createdAt || 0) < f.from) return false;
  if (f.to && (sale.createdAt || 0) > f.to) return false;
  return true;
}

/**
 * Agrega a una lista de ventas (de la nube) las ventas aún en cola que
 * cumplan los filtros — marcadas con `pendingSync: true`. Sin duplicar
 * (por id o clientRef). Las ventas "para revisar" no se mezclan.
 */
export function mergePendingSales(list, queue, filters = {}) {
  const base = Array.isArray(list) ? list : [];
  const q = Array.isArray(queue) ? queue : [];
  if (q.length === 0) return base;
  const ids = new Set(base.map((s) => s && s.id));
  const refs = new Set(base.map((s) => s && s.clientRef).filter(Boolean));
  const extra = q
    .filter((s) => !s._blocked && saleMatchesFilters(s, filters))
    .filter((s) => !ids.has(s.id) && !(s.clientRef && refs.has(s.clientRef)))
    .map((s) => ({ ...stripInternal(s), pendingSync: true }));
  if (extra.length === 0) return base;
  return [...extra, ...base].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

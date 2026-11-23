// =====================================================
// Sales stats & transfer request rules — funciones puras
// =====================================================
// Compartidas por:
//   · warehouse-interior.js (tarjeta "Cierre de caja" + solicitudes)
//   · db.js (saveDailyClosure / setTransferRequestStatus)
//   · tests/closure-stats.test.js · tests/transfer-request.test.js
// Sin dependencias de Supabase ni del DOM — todo testeable.
// =====================================================

/**
 * Clave de día local (YYYY-MM-DD) para agrupar cierres.
 * @param {number} ms - timestamp
 */
export function closureDateKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Calcula el resumen de cierre a partir de las ventas COMPLETADA del período.
 * Misma semántica que el "Resumen" del interior (efectivo por moneda + mixto).
 *
 * @param {Array<Object>} sales - ventas del almacén (se filtra por estado/fecha acá)
 * @param {Object} range - { fromMs, toMs } (inclusive/exclusive)
 * @returns {Object} { salesCount, unitsSold, totalUSD, byCurrency, topProducts }
 */
export function computeClosureStats(sales, { fromMs, toMs }) {
  const empty = {
    USD: { count: 0, amount: 0 },
    MN: { count: 0, amount: 0 },
    EUR: { count: 0, amount: 0 },
    TRANSFERENCIA: { count: 0, amount: 0 },
  };
  const stats = {
    salesCount: 0,
    unitsSold: 0,
    totalUSD: 0,
    byCurrency: { ...empty, USD: { ...empty.USD }, MN: { ...empty.MN }, EUR: { ...empty.EUR }, TRANSFERENCIA: { ...empty.TRANSFERENCIA } },
    topProducts: [],
  };
  const completed = (sales || []).filter((s) =>
    s.status === "COMPLETADA" &&
    (!fromMs || s.createdAt >= fromMs) &&
    (!toMs || s.createdAt < toMs)
  );

  const productAgg = new Map();
  for (const s of completed) {
    stats.salesCount++;
    stats.totalUSD += s.totalAmount || 0;
    if (s.paymentMode === "MULTI") {
      if (s.paidUSD > 0) { stats.byCurrency.USD.count++; stats.byCurrency.USD.amount += s.paidUSD; }
      if (s.paidMN > 0) { stats.byCurrency.MN.count++; stats.byCurrency.MN.amount += s.paidMN; }
      if (s.paidEUR > 0) { stats.byCurrency.EUR.count++; stats.byCurrency.EUR.amount += s.paidEUR; }
      if (s.paidTransfer > 0) { stats.byCurrency.TRANSFERENCIA.count++; stats.byCurrency.TRANSFERENCIA.amount += s.paidTransfer; }
    } else {
      const curr = s.currency || "USD";
      if (stats.byCurrency[curr]) { stats.byCurrency[curr].count++; stats.byCurrency[curr].amount += s.totalAmount || 0; }
    }
    for (const item of s.items || []) {
      const qty = item.quantity || 0;
      stats.unitsSold += qty;
      const key = item.productId || item.name;
      const prev = productAgg.get(key) || { name: item.name || "—", qty: 0, total: 0 };
      prev.qty += qty;
      prev.total += item.subtotal || 0;
      productAgg.set(key, prev);
    }
  }

  stats.topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return stats;
}

// ===== Reglas de solicitudes de traspaso =====

export const REQUEST_TRANSITIONS = {
  PENDIENTE: ["APROBADA", "RECHAZADA", "CANCELADA"],
  APROBADA: [],
  RECHAZADA: [],
  CANCELADA: [],
};

/**
 * ¿Se puede pasar la solicitud de `current` a `next`?
 * Estados terminales: APROBADA, RECHAZADA, CANCELADA.
 */
export function canTransitionRequest(current, next) {
  return (REQUEST_TRANSITIONS[current] || []).includes(next);
}

/**
 * Valida los datos de una solicitud de traspaso.
 * @returns {{ok: boolean, error?: string}}
 */
export function validateTransferRequest({ fromWarehouseId, toWarehouseId, productId, quantity }) {
  if (!fromWarehouseId || !toWarehouseId || !productId) {
    return { ok: false, error: "Faltan datos: origen, destino y producto son obligatorios" };
  }
  if (fromWarehouseId === toWarehouseId) {
    return { ok: false, error: "El origen y el destino no pueden ser el mismo almacén" };
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "La cantidad debe ser un número entero mayor que cero" };
  }
  if (quantity > 1000) {
    return { ok: false, error: "Cantidad fuera de rango (máx 1000 unidades)" };
  }
  return { ok: true };
}

// ===== Reportes de cierres (v5.6) =====

/**
 * Convierte una clave "YYYY-MM-DD" a ms (medianoche local de ese día).
 */
export function dateKeyToMs(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
}

/**
 * Rango de un período de reporte.
 * @param {"week"|"month"|"30d"} kind
 * @param {number} nowMs
 * @returns {{fromMs: number, toMs: number, label: string}}
 */
export function reportPeriodRange(kind, nowMs = Date.now()) {
  const now = new Date(nowMs);
  if (kind === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { fromMs: from, toMs: nowMs, label: "Este mes" };
  }
  if (kind === "30d") {
    return { fromMs: nowMs - 30 * 86400000, toMs: nowMs, label: "Últimos 30 días" };
  }
  // "week" — la semana arranca el lunes (00:00 local)
  const dow = (now.getDay() + 6) % 7; // lun=0 … dom=6
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
  return { fromMs: from, toMs: nowMs, label: "Esta semana" };
}

/**
 * Agrega cierres diarios en un reporte comparativo por almacén.
 * @param {Array<Object>} closures - cierre(s) con { warehouseId, warehouseName, warehouseCode, closureDate, salesCount, unitsSold, totalUSD, byCurrency, topProducts }
 * @param {Object} range - { fromMs, toMs } (sobre closureDate, medianoche local)
 * @returns {Object} { perWarehouse, topProducts, totals, days }
 */
export function aggregateClosuresReport(closures, { fromMs, toMs }) {
  const inRange = (c) => {
    const ms = dateKeyToMs(c.closureDate);
    return (!fromMs || ms >= fromMs) && (!toMs || ms < toMs);
  };
  const list = (closures || []).filter(inRange);

  const whMap = new Map();
  const prodMap = new Map();
  const totals = { closures: list.length, salesCount: 0, unitsSold: 0, totalUSD: 0 };

  for (const c of list) {
    const key = c.warehouseId || "—";
    const wh = whMap.get(key) || {
      warehouseId: key,
      name: c.warehouseName || "—",
      code: c.warehouseCode || "",
      closures: 0,
      salesCount: 0,
      unitsSold: 0,
      totalUSD: 0,
    };
    wh.closures++;
    wh.salesCount += c.salesCount || 0;
    wh.unitsSold += c.unitsSold || 0;
    wh.totalUSD += c.totalUSD || 0;
    whMap.set(key, wh);

    totals.salesCount += c.salesCount || 0;
    totals.unitsSold += c.unitsSold || 0;
    totals.totalUSD += c.totalUSD || 0;

    for (const p of c.topProducts || []) {
      const pk = p.name || "—";
      const prev = prodMap.get(pk) || { name: pk, qty: 0, total: 0 };
      prev.qty += p.qty || 0;
      prev.total += p.total || 0;
      prodMap.set(pk, prev);
    }
  }

  // Días distintos con cierre (para el promedio diario)
  const distinctDays = new Set(list.map((c) => String(c.closureDate)));
  const days = Math.max(distinctDays.size, 1);

  const perWarehouse = Array.from(whMap.values())
    .map((wh) => ({ ...wh, avgDailyUSD: wh.totalUSD / days }))
    .sort((a, b) => b.totalUSD - a.totalUSD);

  const topProducts = Array.from(prodMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  return { perWarehouse, topProducts, totals, days };
}

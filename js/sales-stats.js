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
    byBrand: [],
  };
  const completed = (sales || []).filter((s) =>
    s.status === "COMPLETADA" &&
    (!fromMs || s.createdAt >= fromMs) &&
    (!toMs || s.createdAt < toMs)
  );

  const productAgg = new Map();
  const brandAgg = new Map();
  for (const s of completed) {
    stats.salesCount++;
    stats.totalUSD += s.totalAmount || 0;
    // v5.24.0: cada moneda en SU moneda. Desde v5.16 la venta guarda lo
    // cobrado en paidUSD / paidMN / paidEUR / paidTransfer (también en una sola
    // moneda); antes, una venta en MN sumaba aquí el total en USD como si
    // fueran pesos. Ventas antiguas sin esos campos: total en su moneda.
    const hasPaid = (s.paidUSD > 0) || (s.paidMN > 0) || (s.paidEUR > 0) || (s.paidTransfer > 0);
    if (s.paymentMode === "MULTI" || hasPaid) {
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
      // v5.24.0: ventas por marca
      const brand = String(item.brand || "").trim() || "Sin marca";
      const b = brandAgg.get(brand.toLowerCase()) || { brand, units: 0, total: 0 };
      b.units += qty;
      b.total += item.subtotal || 0;
      brandAgg.set(brand.toLowerCase(), b);
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
  stats.byBrand = Array.from(brandAgg.values())
    .map((b) => ({ ...b, total: Math.round(b.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || b.units - a.units);

  return stats;
}

// =====================================================
// v5.24.0 — Arqueo de caja: fondo inicial + efectivo contado
// =====================================================
export const CASH_CURRENCIES = ["USD", "MN", "EUR"];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cuánto efectivo DEBERÍA haber en caja y cuánto sobra o falta.
 * Esperado = fondo con el que se abrió + lo cobrado en efectivo en esa
 * moneda (las transferencias van a la tarjeta, no a la caja).
 * @param {{stats:Object, opening?:Object, counted?:Object}} p  opening/counted: { USD, MN, EUR }
 * @returns {{rows:Array<{currency,opening,sales,expected,counted,diff,hasCount}>, anyDiff:boolean}}
 */
export function computeCashCount({ stats, opening = {}, counted = {} } = {}) {
  const rows = [];
  for (const c of CASH_CURRENCIES) {
    const op = r2(opening?.[c]);
    const sales = r2(stats?.byCurrency?.[c]?.amount);
    const raw = counted?.[c];
    const hasCount = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(Number(raw));
    if (!op && !sales && !hasCount) continue;
    const expected = r2(op + sales);
    const cnt = hasCount ? r2(raw) : null;
    rows.push({ currency: c, opening: op, sales, expected, counted: cnt, diff: hasCount ? r2(cnt - expected) : null, hasCount });
  }
  return { rows, anyDiff: rows.some((r) => r.hasCount && Math.abs(r.diff) >= 0.01) };
}

/** «Sobran $5.00» / «Faltan 200 MN» / «Cuadra» para una fila del arqueo. */
export function cashDiffLabel(row, fmt) {
  if (!row || !row.hasCount) return "";
  const money = fmt || ((n, c) => `${(Number(n) || 0).toFixed(2)} ${c}`);
  if (Math.abs(row.diff) < 0.01) return "Cuadra";
  return row.diff > 0 ? `Sobran ${money(row.diff, row.currency)}` : `Faltan ${money(-row.diff, row.currency)}`;
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

// =====================================================
// v5.10.0 — Más vendidos · mensaje de cierre · códigos de barras
// =====================================================

/**
 * Más vendidos de un almacén: suma las unidades de cada producto en las
 * ventas COMPLETADAS (opcionalmente solo desde `sinceMs`).
 * @param {Array} sales
 * @param {{limit?: number, sinceMs?: number}} [opts]
 * @returns {Array<{productId: string, name: string, qty: number}>} de mayor a menor
 */
export function computeTopSellers(sales, { limit = 6, sinceMs = 0 } = {}) {
  const agg = new Map();
  for (const s of sales || []) {
    if (!s || s.status !== "COMPLETADA") continue;
    if (sinceMs && !(s.createdAt >= sinceMs)) continue;
    for (const it of s.items || []) {
      if (!it || !it.productId) continue;
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) continue;
      const prev = agg.get(it.productId) || { productId: it.productId, name: it.name || "—", qty: 0 };
      prev.qty += qty;
      agg.set(it.productId, prev);
    }
  }
  return [...agg.values()]
    .sort((a, b) => b.qty - a.qty || String(a.name).localeCompare(String(b.name)))
    .slice(0, Math.max(0, limit));
}

const CLOSURE_CURR_LABEL = { USD: "USD", MN: "MN", EUR: "EUR", TRANSFERENCIA: "Transferencia" };

/**
 * Texto del cierre de caja listo para WhatsApp (*negritas* de WhatsApp).
 * Usa los MISMOS montos que la tarjeta "Cierre de caja" (stats de computeClosureStats).
 * @param {object} p
 * @param {string} p.warehouseName
 * @param {string} [p.warehouseCode]
 * @param {number} p.dateMs
 * @param {object} p.stats - resultado de computeClosureStats
 * @param {string|null} [p.closedBy] - quién cerró la caja (null = aún no se cerró)
 * @param {(amount: number, currency: string) => string} [p.fmt] - formateador de dinero
 */
export function buildClosureShareText({ warehouseName, warehouseCode, dateMs, stats, closedBy = null, fmt, cash = null, note = "" }) {
  const money = fmt || ((n, c) => `${(Number(n) || 0).toFixed(2)} ${c}`);
  const st = stats || { salesCount: 0, unitsSold: 0, totalUSD: 0, byCurrency: {}, topProducts: [] };
  let date = "";
  try {
    date = new Date(dateMs).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    date = new Date(dateMs).toISOString().slice(0, 10);
  }
  const lines = [];
  lines.push("*MANNOL · Cierre de caja*");
  lines.push(`${warehouseName || "Almacén"}${warehouseCode ? ` (${warehouseCode})` : ""} · ${date}`);
  lines.push("");
  lines.push(`Ventas: *${st.salesCount}* · Unidades: *${st.unitsSold}*`);
  lines.push(`Total: *${money(st.totalUSD, "USD")}*`);
  const currs = ["USD", "MN", "EUR", "TRANSFERENCIA"].filter((c) => (st.byCurrency?.[c]?.count || 0) > 0);
  if (currs.length) {
    lines.push("");
    lines.push("*Por moneda*");
    for (const c of currs) {
      const d = st.byCurrency[c];
      lines.push(`• ${CLOSURE_CURR_LABEL[c]}: ${money(d.amount, c)} (${d.count} venta${d.count === 1 ? "" : "s"})`);
    }
  }
  if (st.byBrand?.length) {
    lines.push("");
    lines.push("*Por marca*");
    for (const b of st.byBrand.slice(0, 6)) lines.push(`• ${b.brand}: ${b.units} u · ${money(b.total, "USD")}`);
  }
  if (cash && cash.rows && cash.rows.length) {
    lines.push("");
    lines.push("*Caja (efectivo)*");
    for (const r of cash.rows) {
      const parts = [];
      if (r.opening) parts.push(`fondo ${money(r.opening, r.currency)}`);
      parts.push(`esperado ${money(r.expected, r.currency)}`);
      if (r.hasCount) parts.push(`contado ${money(r.counted, r.currency)} → ${cashDiffLabel(r, money)}`);
      lines.push(`• ${CLOSURE_CURR_LABEL[r.currency]}: ${parts.join(" · ")}`);
    }
  }
  if (note) {
    lines.push("");
    lines.push(`Nota: ${note}`);
  }
  if (st.topProducts?.length) {
    lines.push("");
    lines.push("*Más vendidos*");
    st.topProducts.slice(0, 3).forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${p.qty} u`));
  }
  lines.push("");
  lines.push(closedBy ? `Caja cerrada por ${closedBy}` : (st.salesCount > 0 ? "Caja pendiente de cerrar" : "Sin ventas hoy"));
  return lines.join("\n");
}

/**
 * Normaliza un código escaneado o escrito: sin espacios, guiones ni puntos; en mayúsculas.
 * @param {string} code
 */
export function normalizeCode(code) {
  return String(code ?? "").trim().toUpperCase().replace(/[\s\-_.]/g, "");
}

/**
 * Producto cuyo SKU coincide con el código escaneado (el SKU guarda el código de barras).
 * Tolera EAN-13 con 0 inicial ↔ UPC-A (12 dígitos) y SKUs escritos con guiones/espacios.
 * @param {Array} products
 * @param {string} code
 * @returns {object|null}
 */
export function findProductByCode(products, code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const variants = new Set([c]);
  if (/^\d{13}$/.test(c) && c.startsWith("0")) variants.add(c.slice(1));
  if (/^\d{12}$/.test(c)) variants.add("0" + c);
  for (const p of products || []) {
    const sku = normalizeCode(p?.sku);
    if (sku && variants.has(sku)) return p;
  }
  return null;
}

// =====================================================
// v5.21.0 — Pedido sugerido (puro, testeado)
// =====================================================
/**
 * Qué reponer y cuánto, según lo que se vendió en los últimos `days` días.
 * Objetivo por producto: cubrir `coverDays` días de venta + su mínimo.
 * Entra en la lista si está agotado, por debajo del mínimo o se acaba en
 * menos de `warnDays` días al ritmo actual.
 *
 * @param {{products:Array, stock:Array, sales:Array, nowMs?:number, days?:number, coverDays?:number, warnDays?:number}} p
 * @returns {Array<{productId:string, name:string, qty:number, min:number, perDay:number, daysLeft:number|null, suggested:number, reason:string}>}
 */
export function suggestRestock({ products = [], stock = [], sales = [], nowMs = Date.now(), days = 30, coverDays = 14, warnDays = 7 } = {}) {
  const since = nowMs - days * 86400000;
  const sold = new Map();
  for (const s of sales) {
    if (!s || s.status !== "COMPLETADA" || !(s.createdAt >= since)) continue;
    for (const it of s.items || []) {
      const q = Number(it?.quantity) || 0;
      if (it?.productId && q > 0) sold.set(it.productId, (sold.get(it.productId) || 0) + q);
    }
  }
  const stockMap = new Map(stock.map((x) => [x.productId, x]));
  const out = [];
  for (const p of products) {
    if (!p || p.active === false) continue;
    const st = stockMap.get(p.id);
    const qty = Math.max(0, Number(st?.quantity) || 0);
    const min = Number(st?.minStock || p.minStock) || 5;
    const perDay = (sold.get(p.id) || 0) / days;
    // Sin stock registrado y sin ventas: el almacén no trabaja ese producto
    if (!st && perDay === 0) continue;
    const daysLeft = perDay > 0 ? qty / perDay : null;
    let reason = "";
    if (qty === 0) reason = "agotado";
    else if (qty <= min) reason = "bajo mínimo";
    else if (daysLeft != null && daysLeft < warnDays) reason = `se acaba en ~${Math.max(1, Math.round(daysLeft))} días`;
    if (!reason) continue;
    const target = Math.ceil(perDay * coverDays) + min;
    const suggested = Math.max(0, target - qty);
    if (suggested <= 0) continue;
    out.push({ productId: p.id, name: p.name || "—", qty, min, perDay: Math.round(perDay * 100) / 100, daysLeft, suggested, reason });
  }
  const urgency = (r) => (r.qty === 0 ? -1 : r.daysLeft ?? 999);
  return out.sort((a, b) => urgency(a) - urgency(b) || b.perDay - a.perDay || a.name.localeCompare(b.name));
}

/** Texto del pedido para WhatsApp. */
export function buildRestockText({ warehouseName, items }) {
  const lines = [`*Pedido sugerido · ${warehouseName || "almacén"}*`, ""];
  for (const r of items) lines.push(`• ${r.name}: *${r.suggested}* u (hay ${r.qty}, ${r.reason})`);
  lines.push("", `Total: ${items.reduce((n, r) => n + r.suggested, 0)} unidades`);
  return lines.join("\n");
}


/**
 * v5.34.0: almacenes con ventas completadas ese día y sin cierre de caja.
 * @param {object[]} warehouses
 * @param {object[]} closures      cierres (closureDate "YYYY-MM-DD", warehouseId)
 * @param {(object[]|null)[]} salesByWh  ventas del día de cada almacén (mismo orden; null = no se pudo leer)
 */
export function missingClosures(warehouses, closures, salesByWh, dateKey) {
  const closed = new Set((closures || []).filter((c) => String(c.closureDate) === dateKey).map((c) => String(c.warehouseId)));
  const out = [];
  (warehouses || []).forEach((w, i) => {
    const list = salesByWh?.[i];
    if (!Array.isArray(list) || closed.has(String(w.id))) return;
    const done = list.filter((s) => (s.status || "COMPLETADA") === "COMPLETADA");
    if (!done.length) return;
    out.push({ warehouse: w, sales: done.length, totalUSD: Math.round(done.reduce((a, s) => a + (Number(s.totalAmount ?? s.totalUSD) || 0), 0) * 100) / 100 });
  });
  return out;
}

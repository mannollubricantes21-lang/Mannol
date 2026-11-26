// =====================================================
// Comisión del vendedor POR VENTA (v5.26.0)
// =====================================================
// Regla del negocio: al trabajador del almacén se le paga por cada VENTA
// (no por cada pomo). Venta desde 25 USD → 1 USD; venta de menos → 0.40 USD.
// El admin la cambia en Admin → Comisiones vendedores. Se guarda en
// settings.vendor_sale_rule (jsonb). Sin esa columna (SQL sin ejecutar) se usa
// la regla por defecto de abajo.
//
// Solo ventas al DETALLE. Las ventas por caja (mayorista) siguen pagando lo
// que dice cada tramo del producto (Productos → Venta por caja).
// =====================================================

export const DEFAULT_VENDOR_RULE = Object.freeze({
  enabled: true,
  threshold: 25, // USD: desde este total cobra «above»
  above: 1,      // USD por venta grande
  below: 0.4,    // USD por venta pequeña
});

const num = (v, def) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Regla válida a partir de lo guardado (objeto, JSON en texto o nada). */
export function normalizeVendorRule(raw) {
  let r = raw;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = null; } }
  if (!r || typeof r !== "object") return { ...DEFAULT_VENDOR_RULE };
  return {
    // v5.30.0: siempre por venta (ya no hay comisión de vendedor por producto)
    enabled: true,
    threshold: round2(num(r.threshold, DEFAULT_VENDOR_RULE.threshold)),
    above: round2(num(r.above, DEFAULT_VENDOR_RULE.above)),
    below: round2(num(r.below, DEFAULT_VENDOR_RULE.below)),
  };
}

/**
 * Comisión (USD) de UNA venta al detalle según la regla.
 * @returns {number|null} null si la regla está apagada (se usa la de cada producto)
 */
export function vendorSaleCommission(totalUSD, rule) {
  const r = normalizeVendorRule(rule);
  if (!r.enabled) return null;
  const t = Number(totalUSD) || 0;
  if (t <= 0) return 0;
  return t + 1e-9 >= r.threshold ? r.above : r.below;
}

const usd = (n) => `$${round2(n).toFixed(2)}`;

/** "Venta desde $25.00 → $1.00 · menos de $25.00 → $0.40" */
export function vendorRuleLabel(rule) {
  const r = normalizeVendorRule(rule);
  if (!r.enabled) return "Monto fijo por cada producto (el de cada producto)";
  return `Venta desde ${usd(r.threshold)} → ${usd(r.above)} · menos de ${usd(r.threshold)} → ${usd(r.below)}`;
}

/**
 * Aplica la regla a los ítems de una venta al detalle: la comisión de la venta
 * viaja en el PRIMER ítem normal (items sí se guarda en la nube) y la de cada
 * producto queda en 0 para no contarla dos veces.
 *
 * v5.31.0: los productos con COMISIÓN PROPIA (cargadores, breakers…: marcados
 * en el producto) van aparte: el vendedor cobra su monto fijo por unidad y NO
 * cuentan para la regla. La regla se calcula con el resto del total; si la
 * venta solo tiene productos con comisión propia, no hay comisión por venta.
 * @returns {{ items: object[], vendorUSD: number|null, fixedUSD: number, fixedMN: number }}
 */
export function applyVendorRuleToItems(items, totalUSD, rule) {
  const list = (Array.isArray(items) ? items : []).map((it) => {
    const { vendorSaleCommission: _a, vendorSaleCommissionCurrency: _b, ...rest } = it || {};
    return rest;
  });
  let fixedUSD = 0, fixedMN = 0, ownSubtotal = 0;
  for (const it of list) {
    if (!it.ownVendorCommission) continue;
    const q = Number(it.quantity) || 0;
    const v = (Number(it.vendorCommission) || 0) * q;
    if (String(it.vendorCommissionCurrency || "MN").toUpperCase() === "USD") fixedUSD += v; else fixedMN += v;
    ownSubtotal += Number(it.subtotal != null ? it.subtotal : (Number(it.unitPrice) || 0) * q) || 0;
  }
  fixedUSD = round2(fixedUSD); fixedMN = round2(fixedMN);
  const firstNormal = list.findIndex((it) => !it.ownVendorCommission);
  const base = Math.max(0, (Number(totalUSD) || 0) - ownSubtotal);
  const amount = firstNormal >= 0 ? vendorSaleCommission(base, rule) : 0;
  if (amount === null) return { items: list, vendorUSD: null, fixedUSD, fixedMN };
  return {
    items: list.map((it, i) => (it.ownVendorCommission ? it : {
      ...it,
      vendorCommission: 0,
      vendorCommissionCurrency: "USD",
      ...(i === firstNormal ? { vendorSaleCommission: amount, vendorSaleCommissionCurrency: "USD" } : {}),
    })),
    vendorUSD: amount,
    fixedUSD,
    fixedMN,
  };
}

// =====================================================
// Comisión del GESTOR (v5.28.0)
// =====================================================
// Regla del negocio: el gestor cobra un % del total de la venta que trae:
//   ventas normales (por unidad) → 5 %   · ventas por caja (mayorista) → 3 %
// Cada gestor guarda sus dos porcentajes (Admin → Gestores): `commission`
// (normales) y `commissionWholesale` (por caja). «Valor fijo»: monto por venta.
export const DEFAULT_GESTOR_PCT = Object.freeze({ retail: 5, wholesale: 3 });

const pctOr = (v, def) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 ? def : n;
};

/** % que se aplica a una venta de este gestor (null si es valor fijo) */
export function gestorPercentFor(manager, saleType) {
  if (!manager || (manager.commissionType || "PERCENT") !== "PERCENT") return null;
  return saleType === "WHOLESALE"
    ? pctOr(manager.commissionWholesale, DEFAULT_GESTOR_PCT.wholesale)
    : pctOr(manager.commission, DEFAULT_GESTOR_PCT.retail);
}

/**
 * Comisión del gestor por UNA venta.
 * @param {object|null} manager
 * @param {{ total:number, saleType?:string }} sale  total en USD
 * @returns {{ usd:number, mn:number }}
 */
export function gestorSaleCommission(manager, { total, saleType, wholesalePct } = {}) {
  if (!manager) return { usd: 0, mn: 0 };
  // v5.30.0: en venta por caja manda el % configurado en el producto
  // (Admin → Venta mayorista), sea cual sea el tipo de gestor.
  const wp = Number(wholesalePct);
  const hasWp = wholesalePct !== null && wholesalePct !== undefined && wholesalePct !== "" && Number.isFinite(wp) && wp >= 0;
  const pct = saleType === "WHOLESALE" && hasWp ? wp : gestorPercentFor(manager, saleType);
  if (pct === null) {
    const v = round2(Number(manager.commission) || 0);
    return String(manager.commissionCurrency || "USD").toUpperCase() === "MN" ? { usd: 0, mn: v } : { usd: v, mn: 0 };
  }
  return { usd: round2((Number(total) || 0) * pct / 100), mn: 0 };
}

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
    enabled: r.enabled !== false,
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
 * viaja en el PRIMER ítem (items sí se guarda en la nube) y la de cada producto
 * queda en 0 para no contarla dos veces. Sin regla, se quitan restos de una
 * venta anterior («Vender de nuevo») y se deja la de cada producto.
 * @returns {{ items: object[], vendorUSD: number|null }}
 */
export function applyVendorRuleToItems(items, totalUSD, rule) {
  const amount = vendorSaleCommission(totalUSD, rule);
  const list = (Array.isArray(items) ? items : []).map((it) => {
    const { vendorSaleCommission: _a, vendorSaleCommissionCurrency: _b, ...rest } = it || {};
    return rest;
  });
  if (amount === null) return { items: list, vendorUSD: null };
  return {
    items: list.map((it, i) => ({
      ...it,
      vendorCommission: 0,
      vendorCommissionCurrency: "USD",
      ...(i === 0 ? { vendorSaleCommission: amount, vendorSaleCommissionCurrency: "USD" } : {}),
    })),
    vendorUSD: amount,
  };
}

// =====================================================
// Venta mayorista (v5.30.0) — configuración por producto
//
// Se configura en Admin → Venta mayorista (ya no dentro de cada producto):
//   · pomos por caja
//   · mínimo de cajas para que sea venta mayorista
//   · precio por caja (USD)
//   · comisión del gestor (% del total, por defecto 3)
//   · almacenes donde se puede vender por caja (vacío = todos)
//   · v5.31.0: cuánto gana el vendedor por esa venta (vacío = regla por venta)
//
// Se guarda en las columnas de siempre (units_per_box y wholesale_tiers), así
// no hace falta SQL. Los almacenes van dentro del tramo (warehouseIds).
// =====================================================

export const DEFAULT_WHOLESALE_GESTOR_PCT = 3;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  return Number(String(v).replace(",", "."));
};

function sortedTiers(p) {
  return Array.isArray(p?.wholesaleTiers)
    ? [...p.wholesaleTiers].filter(Boolean).sort((a, b) => (a.minBoxes || 0) - (b.minBoxes || 0))
    : [];
}

/** Precio por caja de un tramo (usa el guardado; si no, pomo × pomos por caja). */
export function tierPricePerBox(tier, unitsPerBox) {
  if (!tier) return 0;
  const direct = Number(tier.pricePerBox);
  if (direct > 0) return round2(direct);
  return round2((Number(tier.pricePerUnit) || 0) * (Number(unitsPerBox) || 0));
}

/** % del gestor en la venta por caja de este producto. */
export function wholesaleGestorPct(p) {
  const t = sortedTiers(p)[0];
  const v = Number(t?.gestorCommissionPercent);
  if (t && t.gestorCommissionPercent !== undefined && t.gestorCommissionPercent !== null && t.gestorCommissionPercent !== "" && Number.isFinite(v) && v >= 0) return v;
  return DEFAULT_WHOLESALE_GESTOR_PCT;
}

/** v5.31.0: lo que gana el vendedor por UNA venta por caja (null = regla por venta). */
export function wholesaleVendorAmount(p) {
  const v = sortedTiers(p)[0]?.vendorSaleAmount;
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 ? null : round2(n);
}

/** Cajas mínimas para venta mayorista (≥ 1). */
export function wholesaleMinBoxes(p) {
  const t = sortedTiers(p)[0];
  const m = Math.floor(Number(t?.minBoxes) || 0);
  return m >= 1 ? m : 1;
}

/** Almacenes donde se vende por caja (null = todos). */
export function wholesaleWarehouseIds(p) {
  const ids = sortedTiers(p)[0]?.warehouseIds;
  return Array.isArray(ids) && ids.length ? ids.map(String) : null;
}

/** ¿Este producto se puede vender por caja en este almacén? */
export function wholesaleAvailableIn(p, warehouseId) {
  if (!(p?.unitsPerBox > 0) || !sortedTiers(p).length) return false;
  const ids = wholesaleWarehouseIds(p);
  if (!ids || !warehouseId) return true;
  return ids.includes(String(warehouseId));
}

/** Configuración legible (o null si el producto no se vende por caja). */
export function wholesaleConfigOf(p) {
  const tiers = sortedTiers(p);
  if (!(p?.unitsPerBox > 0) || !tiers.length) return null;
  return {
    unitsPerBox: Number(p.unitsPerBox),
    minBoxes: wholesaleMinBoxes(p),
    pricePerBox: tierPricePerBox(tiers[0], p.unitsPerBox),
    gestorPct: wholesaleGestorPct(p),
    warehouseIds: wholesaleWarehouseIds(p),
    vendorAmount: wholesaleVendorAmount(p),
    extraTiers: tiers.length - 1,
  };
}

/**
 * Revisa lo escrito en el formulario.
 * @returns {{ ok:boolean, errors:Record<string,string>, values?:object }}
 */
export function validateWholesaleConfig(raw = {}) {
  const errors = {};
  const units = num(raw.unitsPerBox);
  const minBoxes = num(raw.minBoxes);
  const price = num(raw.pricePerBox);
  const pct = raw.gestorPct === "" || raw.gestorPct === undefined || raw.gestorPct === null ? DEFAULT_WHOLESALE_GESTOR_PCT : num(raw.gestorPct);
  if (!raw.productId) errors.productId = "Elige el producto";
  if (!Number.isInteger(units) || units < 1) errors.unitsPerBox = "Pon cuántos pomos trae la caja";
  if (!Number.isInteger(minBoxes) || minBoxes < 1) errors.minBoxes = "Mínimo 1 caja";
  if (!(price > 0)) errors.pricePerBox = "Pon el precio por caja";
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.gestorPct = "Entre 0 y 100";
  const vBlank = raw.vendorAmount === "" || raw.vendorAmount === undefined || raw.vendorAmount === null;
  const vendor = vBlank ? null : num(raw.vendorAmount);
  if (!vBlank && !(Number.isFinite(vendor) && vendor >= 0)) errors.vendorAmount = "Pon un monto (o déjalo vacío)";
  const ok = Object.keys(errors).length === 0;
  if (!ok) return { ok, errors };
  const ids = Array.isArray(raw.warehouseIds) && raw.warehouseIds.length ? raw.warehouseIds.map(String) : null;
  return { ok, errors, values: { productId: raw.productId, unitsPerBox: units, minBoxes, pricePerBox: round2(price), gestorPct: pct, warehouseIds: ids, vendorAmount: vendor === null ? null : round2(vendor) } };
}

/** Campos del producto a guardar a partir de la configuración. */
export function wholesaleFieldsFrom(cfg) {
  if (!cfg) return { unitsPerBox: null, wholesaleTiers: [] };
  const tier = {
    minBoxes: cfg.minBoxes,
    maxBoxes: null,
    pricePerBox: round2(cfg.pricePerBox),
    pricePerUnit: Math.round((cfg.pricePerBox / cfg.unitsPerBox) * 10000) / 10000,
    vendorCommission: 0,
    gestorCommission: 0,
    gestorCommissionPercent: cfg.gestorPct,
  };
  if (cfg.warehouseIds && cfg.warehouseIds.length) tier.warehouseIds = cfg.warehouseIds;
  if (cfg.vendorAmount !== null && cfg.vendorAmount !== undefined) tier.vendorSaleAmount = round2(cfg.vendorAmount);
  return { unitsPerBox: cfg.unitsPerBox, wholesaleTiers: [tier] };
}

/**
 * v5.32.0: ¿el producto se configuró en «Venta mayorista» o viene del formato
 * viejo (precios por pomo desde el formulario de producto)? Los viejos se
 * marcan «Revisar» para poner el mínimo real de cajas.
 */
export function wholesaleNeedsReview(p) {
  const t = sortedTiers(p);
  if (!(p?.unitsPerBox > 0) || !t.length) return false;
  return t.length > 1 || !(Number(t[0].pricePerBox) > 0) || t[0].gestorCommissionPercent === undefined;
}

/**
 * v5.32.0: productos de venta por caja de ESTE almacén que no llegan al mínimo
 * de cajas (no se podrán vender por caja hasta reponer).
 * @param {object[]} products
 * @param {Record<string, number>} qtyById  pomos en stock por producto
 * @returns {{ productId:string, name:string, boxes:number, minBoxes:number, missingUnits:number }[]}
 */
export function wholesaleShortages(products, qtyById, warehouseId) {
  const out = [];
  for (const p of Array.isArray(products) ? products : []) {
    if (p?.active === false || !wholesaleAvailableIn(p, warehouseId)) continue;
    const units = Number(p.unitsPerBox) || 0;
    const qty = Math.max(0, Number(qtyById?.[p.id]) || 0);
    const boxes = Math.floor(qty / units);
    const minBoxes = wholesaleMinBoxes(p);
    if (boxes < minBoxes) out.push({ productId: p.id, name: p.name, boxes, minBoxes, missingUnits: minBoxes * units - qty });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

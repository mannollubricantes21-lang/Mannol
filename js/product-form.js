// =====================================================
// Formulario de producto del admin — lógica pura (v5.15.0)
//
//  · Marca: se muestran TODAS las marcas conocidas como botones. Antes era un
//    campo con <datalist>, que solo sugiere lo que coincide con lo ya escrito:
//    con "MANNOL" puesto por defecto, las demás marcas añadidas no salían nunca
//    (y en Android/Yandex el datalist casi no funciona).
//  · Números con coma o punto ("1,5" = 1.5): teclado del teléfono en español.
//  · Precios por caja como filas "desde N cajas" (antes había que escribir JSON
//    a mano). Se guarda la misma forma de siempre:
//      [{ minBoxes, maxBoxes, pricePerUnit, vendorCommission, gestorCommission }]
//    con maxBoxes = (desde del siguiente tramo − 1) y el último sin tope (null).
//    Es lo mismo que ya hacía getWholesaleTier(): por debajo del primer tramo o
//    en un hueco entre tramos se aplicaba el primero.
//  · Revisión campo a campo con mensajes claros (antes solo un aviso general).
// =====================================================
import { canonicalBrand, normalizeKey } from "./catalog-facets.js";

/**
 * Convierte lo escrito en un número. Acepta coma o punto decimal.
 *   ""  → null (campo vacío)        "1,5" → 1.5      "22.50" → 22.5
 *   "1.234,56" → 1234.56            "1.234.567" → 1234567
 *   "abc" → NaN (no es un número)   "-2" → -2 (lo rechaza la validación)
 * Un solo separador siempre se toma como decimal ("1.500" → 1.5).
 */
export function parseDecimal(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let s = String(value).trim().replace(/\s+/g, "");
  if (!s) return null;
  let sign = 1;
  if (s[0] === "-" || s[0] === "+") {
    if (s[0] === "-") sign = -1;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  let normalized;
  if (commas && dots) {
    // El último separador es el decimal; el otro, de miles
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousands = dec === "," ? /\./g : /,/g;
    const parts = s.replace(thousands, "").split(dec);
    if (parts.length !== 2) return NaN;
    normalized = `${parts[0]}.${parts[1]}`;
  } else if (commas + dots === 1) {
    normalized = s.replace(",", ".");
  } else if (commas + dots > 1) {
    // "1.234.567" → miles
    normalized = s.replace(/[.,]/g, "");
  } else {
    normalized = s;
  }
  if (normalized.startsWith(".")) normalized = `0${normalized}`;
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  const n = Number(normalized);
  return Number.isFinite(n) ? sign * n : NaN;
}

/** Número guardado → texto para el campo ("" si no hay). */
export function numberToInput(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = typeof n === "number" ? n : parseDecimal(n);
  return Number.isFinite(v) ? String(v) : "";
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 22.5 → "22.50" (montos en pantalla) */
export function money2(n) {
  return round2(n).toFixed(2);
}

// ---------------------------------------------------------------- Marcas

/**
 * Marcas para elegir: todas las conocidas (en su orden, sin repetir) y, si el
 * producto trae una que no está en la lista, también esa.
 * @returns {{ list: string[], selected: string }}
 */
export function brandChoices(known = [], current = "") {
  const list = [];
  const seen = new Set();
  for (const raw of known || []) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    const key = normalizeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(name);
  }
  const selected = canonicalBrand(current, list);
  if (selected && !seen.has(normalizeKey(selected))) list.push(selected);
  return { list, selected };
}

/** La marca de la lista que es igual a lo escrito (sin mirar mayúsculas ni tildes), o "". */
export function findBrand(input, list = []) {
  const key = normalizeKey(input);
  if (!key) return "";
  return (list || []).find((b) => normalizeKey(b) === key) || "";
}

// ---------------------------------------------------------------- Precios por caja

const TIER_KEYS = ["minBoxes", "maxBoxes", "pricePerUnit", "vendorCommission", "gestorCommission"];
const ROW_FIELDS = ["minBoxes", "pricePerUnit", "vendorCommission", "gestorCommission"];

/** Tramos guardados → filas editables (texto), ordenadas. El 1.º empieza en 1 caja. */
export function tiersToRows(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .filter((t) => t && typeof t === "object")
    .slice()
    .sort((a, b) => (Number(a.minBoxes) || 0) - (Number(b.minBoxes) || 0))
    .map((t, i) => {
      const extra = {};
      for (const [k, v] of Object.entries(t)) if (!TIER_KEYS.includes(k)) extra[k] = v;
      return {
        minBoxes: i === 0 ? "1" : numberToInput(t.minBoxes),
        pricePerUnit: numberToInput(t.pricePerUnit),
        vendorCommission: numberToInput(t.vendorCommission),
        gestorCommission: numberToInput(t.gestorCommission),
        extra,
      };
    });
}

/** ¿La fila está vacía? (la 1.ª no cuenta el "desde", que siempre es 1) */
export function isBlankTierRow(row, position = 0) {
  return ROW_FIELDS.every((k) => {
    if (k === "minBoxes" && position === 0) return true;
    return !String(row?.[k] ?? "").trim();
  });
}

/**
 * Filas → tramos para guardar, o errores por fila.
 * - La 1.ª fila es el precio base: empieza siempre en 1 caja.
 * - Las demás filas vacías se ignoran; cada una empieza en más cajas que la anterior.
 * - maxBoxes = desde del siguiente − 1; el último, sin tope (null).
 * - Si todas las filas están vacías → sin tramos.
 * @returns {{ tiers: object[], errors: {index:number, field:string, message:string}[] }}
 */
export function rowsToTiers(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const errors = [];
  const out = [];
  if (list.every((row, i) => isBlankTierRow(row, i))) return { tiers: [], errors };
  let prevMin = 0;
  list.forEach((row, index) => {
    if (index > 0 && isBlankTierRow(row, index)) return;
    const err = (field, message) => errors.push({ index, field, message });

    let min = 1;
    if (index > 0) {
      min = parseDecimal(row.minBoxes);
      if (min === null) err("minBoxes", "¿Desde cuántas cajas?");
      else if (!Number.isInteger(min) || min < 2) err("minBoxes", "Pon un número entero de cajas (2 o más)");
      else if (min <= prevMin) err("minBoxes", `Tiene que ser más de ${prevMin} (lo del precio anterior)`);
    }
    const price = parseDecimal(row?.pricePerUnit);
    if (price === null) err("pricePerUnit", index === 0 ? "Pon el precio por pomo (desde 1 caja)" : "Pon el precio por pomo");
    else if (Number.isNaN(price)) err("pricePerUnit", "Escribe solo números (ej. 22.50)");
    else if (price <= 0) err("pricePerUnit", "Tiene que ser mayor que 0");

    const commission = (field) => {
      const v = parseDecimal(row?.[field]);
      if (v === null) return 0;
      if (Number.isNaN(v)) { err(field, "Escribe solo números"); return 0; }
      if (v < 0) { err(field, "No puede ser negativa"); return 0; }
      return v;
    };
    const vendorCommission = commission("vendorCommission");
    const gestorCommission = commission("gestorCommission");

    out.push({ ...(row?.extra || {}), minBoxes: min, maxBoxes: null, pricePerUnit: price, vendorCommission, gestorCommission });
    if (Number.isInteger(min) && min > prevMin) prevMin = min;
  });
  if (errors.length) return { tiers: [], errors };
  for (let i = 0; i < out.length; i++) {
    out[i].maxBoxes = i < out.length - 1 ? out[i + 1].minBoxes - 1 : null;
  }
  return { tiers: out, errors: [] };
}

/** "1 a 5 cajas" · "6 cajas o más" · "1 caja" — según dónde empieza el siguiente tramo. */
export function tierRangeLabel(min, nextMin) {
  const a = parseDecimal(min);
  if (!Number.isInteger(a) || a < 1) return "";
  const cajas = (n) => `${n} ${n === 1 ? "caja" : "cajas"}`;
  const b = parseDecimal(nextMin);
  if (!Number.isInteger(b) || b <= a) return `${cajas(a)} o más`;
  const max = b - 1;
  return max === a ? cajas(a) : `${a} a ${max} cajas`;
}

/** Lo que sale por caja en un tramo (null si falta el dato). */
export function tierPerBox(row, unitsPerBox) {
  const units = parseDecimal(unitsPerBox);
  const price = parseDecimal(row?.pricePerUnit);
  if (!Number.isInteger(units) || units < 1 || !(price > 0)) return null;
  const num = (v) => {
    const n = parseDecimal(v);
    return n > 0 ? n : 0;
  };
  return {
    price: round2(price * units),
    vendor: round2(num(row.vendorCommission) * units),
    gestor: round2(num(row.gestorCommission) * units),
  };
}

/** Resumen de la sección "Venta por caja". */
export function wholesaleSummary(enabled, unitsPerBox, rows = []) {
  if (!enabled) return "No se vende por caja";
  const units = parseDecimal(unitsPerBox);
  const count = (rows || []).filter((r, i) => !isBlankTierRow(r, i)).length;
  if (!Number.isInteger(units) || units < 1) return "Falta poner cuántos pomos trae la caja";
  const base = `${units} ${units === 1 ? "pomo" : "pomos"} por caja`;
  if (!count) return `${base} · falta el precio por caja`;
  return `${base} · ${count} ${count === 1 ? "precio" : "precios"}`;
}

// ---------------------------------------------------------------- Ganancia

/** Ganancia por unidad con el costo: { profit, pct } (null si falta precio o costo). */
export function marginInfo(price, cost) {
  const p = parseDecimal(price);
  const c = parseDecimal(cost);
  if (!(p > 0) || !(c > 0)) return null;
  const profit = round2(p - c);
  return { profit, pct: Math.round(((p - c) / c) * 100) };
}

// ---------------------------------------------------------------- Revisión

/**
 * Revisa el formulario. `v` trae los textos tal cual están en los campos:
 *   { name, brand, price, costPrice, minStock, vendorCommission, gestorCommission,
 *     wholesale (bool), unitsPerBox, tiers (filas) }
 * @returns {{ ok:boolean, errors:Object<string,string>, tierErrors:object[],
 *             warnings:Object<string,string>, values:object }}
 */
export function validateProductForm(v = {}) {
  const errors = {};
  const warnings = {};

  const name = String(v.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) errors.name = "Escribe el nombre del producto";

  const brand = String(v.brand ?? "").replace(/\s+/g, " ").trim();
  if (!brand) errors.brand = "Elige la marca o escribe una nueva";

  const price = parseDecimal(v.price);
  if (price === null) errors.price = "Pon el precio de venta";
  else if (Number.isNaN(price)) errors.price = "Escribe solo números (ej. 22.50)";
  else if (price <= 0) errors.price = "El precio tiene que ser mayor que 0";

  const amount = (field, value, { integer = false, label = "un número" } = {}) => {
    const n = parseDecimal(value);
    if (n === null) return null;
    if (Number.isNaN(n)) { errors[field] = `Escribe ${label}`; return null; }
    if (n < 0) { errors[field] = "No puede ser negativo"; return null; }
    if (integer && !Number.isInteger(n)) { errors[field] = "Pon un número entero"; return null; }
    return n;
  };
  const costPrice = amount("costPrice", v.costPrice, { label: "solo números (ej. 15.00)" });
  const minStock = amount("minStock", v.minStock, { integer: true, label: "un número entero" });
  const vendorCommission = amount("vendorCommission", v.vendorCommission);
  const gestorCommission = amount("gestorCommission", v.gestorCommission);
  if (!errors.vendorCommission && !vendorCommission) {
    warnings.vendorCommission = "Con 0, el vendedor no gana nada por este producto";
  }
  if (!errors.price && costPrice > 0 && price > 0 && costPrice > price) {
    warnings.costPrice = "El costo es mayor que el precio de venta";
  }

  let unitsPerBox = null;
  let wholesaleTiers = [];
  let tierErrors = [];
  if (v.wholesale) {
    const units = parseDecimal(v.unitsPerBox);
    if (units === null) errors.unitsPerBox = "¿Cuántos pomos trae la caja?";
    else if (!Number.isInteger(units) || units < 1) errors.unitsPerBox = "Pon un número entero (1 o más)";
    else unitsPerBox = units;
    const res = rowsToTiers(v.tiers || []);
    tierErrors = res.errors;
    wholesaleTiers = res.tiers;
    if (!res.errors.length && !res.tiers.length) {
      warnings.tiers = "Sin precio por caja no se podrá vender por caja";
    }
  }

  return {
    ok: Object.keys(errors).length === 0 && tierErrors.length === 0,
    errors,
    tierErrors,
    warnings,
    values: {
      name,
      brand,
      salePrice: price > 0 ? price : 0,
      costPrice: costPrice ?? 0,
      minStock: minStock ?? 0,
      vendorCommission: vendorCommission ?? 0,
      gestorCommission: gestorCommission ?? 0,
      unitsPerBox,
      wholesaleTiers,
    },
  };
}

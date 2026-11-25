// =====================================================
// Pagos (puro) — v5.16.0
// Convierte y compara pagos con la tasa del día. `rates` es el mapa del
// estado: { MN: { rateUSD: 1/320 }, EUR: { rateUSD: 1.08 }, ... } donde
// rateUSD = USD que vale 1 unidad de esa moneda.
// Los montos de cada moneda se guardan en SU moneda (paidMN en pesos…) y
// amountUSD lleva el equivalente en USD con el que se compara el total.
// =====================================================

export const PAY_TOLERANCE_USD = 0.01;

export const roundCents = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** USD por 1 unidad de `currency`; null si no hay tasa válida. */
export function rateUSD(currency, rates) {
  if (currency === "USD") return 1;
  const r = Number(rates?.[currency]?.rateUSD);
  return r > 0 ? r : null;
}

/** Monto en USD → monto en la moneda indicada (null sin tasa). */
export function usdToNative(usd, currency, rates) {
  const r = rateUSD(currency, rates);
  return r == null ? null : roundCents((Number(usd) || 0) / r);
}

/**
 * Resume un pago en varias monedas contra el total (USD).
 * @param {Record<string, number>} multi  { USD, MN, EUR, TRANSFERENCIA } en su propia moneda
 * @returns {{lines:Array, paidUSD:number, missingUSD:number, overUSD:number, missingRates:string[], ok:boolean}}
 */
export function summarizeMultiPayment(multi, totalUSD, rates) {
  const lines = [];
  const missingRates = [];
  let paid = 0;
  for (const currency of Object.keys(multi || {})) {
    const amount = Number(multi[currency]) || 0;
    if (amount <= 0) continue;
    const r = rateUSD(currency, rates);
    if (r == null) {
      missingRates.push(currency);
      continue;
    }
    const amountUSD = roundCents(amount * r);
    paid += amountUSD;
    lines.push({ currency, amount: roundCents(amount), amountUSD, exchangeRate: r });
  }
  paid = roundCents(paid);
  const diff = roundCents(roundCents(totalUSD) - paid);
  const missingUSD = diff > PAY_TOLERANCE_USD ? diff : 0;
  const overUSD = diff < -PAY_TOLERANCE_USD ? -diff : 0;
  return {
    lines,
    paidUSD: paid,
    missingUSD,
    overUSD,
    missingRates,
    ok: lines.length > 0 && missingRates.length === 0 && missingUSD === 0 && overUSD === 0,
  };
}

// =====================================================
// v5.18.0 — Atajos de cobro (puro, testeado)
// =====================================================

const PAY_CURRENCIES = new Set(["USD", "MN", "EUR", "TRANSFERENCIA"]);

const BILL_SYMBOL = { USD: "$", EUR: "€", MN: "₱" };

/**
 * Billetes comunes en el mostrador, por moneda. Un toque = monto completo
 * en el campo «¿Con cuánto paga el cliente?» (evita teclear cifras).
 */
export const BILLS_BY_CURRENCY = {
  USD: [5, 10, 20, 50, 100],
  EUR: [5, 10, 20, 50],
  MN: [500, 1000, 2000, 5000],
  TRANSFERENCIA: [],
};

/**
 * Presets del teclado rápido para la moneda dada: sus billetes + «Exacto»
 * con el total convertido a ESA moneda (con la tasa del día). Sin tasa para
 * la moneda, el chip «Exacto» no se ofrece (los billetes quedan solos).
 * @param {string} currency
 * @param {number} totalUSD
 * @param {Object} rates  mapa de tasas del estado
 * @returns {Array<{label:string, value:number}>}
 */
export function billPresetsFor(currency, totalUSD, rates) {
  const bills = (BILLS_BY_CURRENCY[currency] || []).map((b) => ({
    label: `${BILL_SYMBOL[currency] || ""}${b}`,
    value: b,
  }));
  const exact = usdToNative(totalUSD, currency, rates);
  if (exact != null) bills.push({ label: "Exacto", value: exact });
  return bills;
}

/**
 * v5.18.0 — preferencia de cobro recordada por almacén.
 * Acepta el objeto o su JSON (tal cual sale de localStorage) y devuelve
 * { mode, currency } seguro, o null si no sirve. En MULTI la moneda no se
 * recuerda (se usan varias); en SINGLE exige una moneda conocida.
 * @returns {{mode:string, currency:string|null}|null}
 */
export function normalizePaymentPreference(raw) {
  let v = raw;
  try {
    if (typeof v === "string") v = JSON.parse(v);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const mode = v.mode === "MULTI" ? "MULTI" : v.mode === "SINGLE" ? "SINGLE" : null;
  if (!mode) return null;
  if (mode === "MULTI") return { mode, currency: null };
  const currency = PAY_CURRENCIES.has(v.currency) ? v.currency : null;
  return currency ? { mode, currency } : null;
}

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

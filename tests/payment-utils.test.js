import { describe, it, expect } from "vitest";
import { roundCents, rateUSD, usdToNative, summarizeMultiPayment } from "../js/payment-utils.js";

const rates = { MN: { rateUSD: 1 / 320 }, EUR: { rateUSD: 1.08 }, TRANSFERENCIA: { rateUSD: 1 / 320 } };

describe("payment-utils", () => {
  it("roundCents redondea a centavos", () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents("x")).toBe(0);
  });
  it("rateUSD: USD siempre 1; sin tasa → null", () => {
    expect(rateUSD("USD", {})).toBe(1);
    expect(rateUSD("MN", {})).toBeNull();
    expect(rateUSD("MN", rates)).toBeCloseTo(1 / 320);
  });
  it("usdToNative convierte el total a la moneda", () => {
    expect(usdToNative(20, "MN", rates)).toBe(6400);
    expect(usdToNative(20, "USD", rates)).toBe(20);
    expect(usdToNative(20, "MN", {})).toBeNull();
  });
  it("pago completo en varias monedas", () => {
    const s = summarizeMultiPayment({ USD: 10, MN: 3200, EUR: 0, TRANSFERENCIA: 0 }, 20, rates);
    expect(s.ok).toBe(true);
    expect(s.paidUSD).toBe(20);
    expect(s.lines.map((l) => l.currency)).toEqual(["USD", "MN"]);
    expect(s.lines[1].amountUSD).toBe(10);
  });
  it("falta y sobra se reportan por separado", () => {
    expect(summarizeMultiPayment({ USD: 8 }, 20, rates)).toMatchObject({ ok: false, missingUSD: 12, overUSD: 0 });
    expect(summarizeMultiPayment({ USD: 25 }, 20, rates)).toMatchObject({ ok: false, missingUSD: 0, overUSD: 5 });
  });
  it("sin pagos o sin tasa no es válido", () => {
    expect(summarizeMultiPayment({}, 20, rates).ok).toBe(false);
    const s = summarizeMultiPayment({ MN: 6400 }, 20, {});
    expect(s.ok).toBe(false);
    expect(s.missingRates).toEqual(["MN"]);
  });
  it("tolera 1 centavo de diferencia por la conversión", () => {
    expect(summarizeMultiPayment({ USD: 19.99 }, 20, rates).ok).toBe(true);
  });
});

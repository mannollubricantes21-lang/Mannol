import { describe, it, expect } from "vitest";
import { applyMnSurcharge, mixRestInMN, summarizeMultiPayment, rateUSD } from "../js/payment-utils.js";
import { sortOutOfStockLast } from "../js/catalog-facets.js";

const rates = { MN: { rateUSD: 1 / 320 }, EUR: { rateUSD: 1.08 } };

describe("v5.20.0 · pago mixto con recargo por USD", () => {
  it("aplica +10 / +20 MN por cada USD", () => {
    expect(1 / rateUSD("MN", applyMnSurcharge(rates, 10))).toBeCloseTo(330);
    expect(1 / rateUSD("MN", applyMnSurcharge(rates, 20))).toBeCloseTo(340);
    expect(applyMnSurcharge(rates, 0)).toBe(rates);
    expect(applyMnSurcharge({}, 10)).toEqual({});
  });

  it("calcula el resto en MN al poner un monto en USD", () => {
    const r = applyMnSurcharge(rates, 10);
    // Total 50 USD, paga 30 USD → faltan 20 USD × 330 = 6600 MN
    expect(mixRestInMN({ USD: 30, MN: 0 }, 50, r)).toBe(6600);
    // El MN que hubiera escrito no cuenta para el cálculo
    expect(mixRestInMN({ USD: 30, MN: 999 }, 50, r)).toBe(6600);
    // Con ese MN el pago queda completo
    expect(summarizeMultiPayment({ USD: 30, MN: 6600 }, 50, r).ok).toBe(true);
  });

  it("redondea hacia arriba a pesos enteros y sigue cuadrando", () => {
    const r = applyMnSurcharge(rates, 20);
    const mn = mixRestInMN({ USD: 10 }, 10.37, r); // 0.37 × 340 = 125.8 → 126
    expect(mn).toBe(126);
    expect(summarizeMultiPayment({ USD: 10, MN: mn }, 10.37, r).ok).toBe(true);
  });

  it("0 si no se cobró nada en otra moneda o ya está completo", () => {
    const r = applyMnSurcharge(rates, 10);
    expect(mixRestInMN({ USD: 0 }, 50, r)).toBe(0);
    expect(mixRestInMN({ USD: 50 }, 50, r)).toBe(0);
    expect(mixRestInMN({ USD: 10 }, 50, {})).toBe(0);
  });
});

describe("v5.20.0 · agotados al final del catálogo", () => {
  it("mueve los productos sin stock al final, respetando el orden", () => {
    const qty = { a: 0, b: 3, c: 0, d: 1 };
    const list = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(sortOutOfStockLast(list, (p) => qty[p.id]).map((p) => p.id)).toEqual(["b", "d", "a", "c"]);
  });
});

import { normalizeMixSurcharges } from "../js/payment-utils.js";
describe("v5.21.0 · recargos configurables", () => {
  it("normaliza la lista del admin", () => {
    expect(normalizeMixSurcharges({ mixSurchargeOptions: [20, 10, 10, -5, "x"], mixSurchargeDefault: 20 }))
      .toEqual({ options: [0, 10, 20], def: 20 });
    expect(normalizeMixSurcharges({ mixSurchargeOptions: "15, 25", mixSurchargeDefault: 99 }))
      .toEqual({ options: [0, 15, 25], def: 15 });
    expect(normalizeMixSurcharges({})).toEqual({ options: [0, 10, 20], def: 10 });
    expect(normalizeMixSurcharges({ mixSurchargeOptions: [], mixSurchargeDefault: 0 })).toEqual({ options: [0], def: 0 });
  });
});

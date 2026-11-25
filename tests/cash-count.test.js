import { describe, it, expect } from "vitest";
import { computeClosureStats, computeCashCount, cashDiffLabel, buildClosureShareText } from "../js/sales-stats.js";

const day = Date.UTC(2026, 10, 25, 15);
const sales = [
  // Una moneda en USD
  { status: "COMPLETADA", createdAt: day, currency: "USD", paymentMode: "SINGLE", totalAmount: 22, paidUSD: 22,
    items: [{ productId: "a", name: "Energy 10W-40", brand: "MANNOL", quantity: 1, subtotal: 22 }] },
  // Una moneda en MN: el cierre debe sumar 7.040 MN, no 22 «MN»
  { status: "COMPLETADA", createdAt: day, currency: "MN", paymentMode: "SINGLE", totalAmount: 22, paidMN: 7040,
    items: [{ productId: "a", name: "Energy 10W-40", brand: "MANNOL", quantity: 1, subtotal: 22 }] },
  // Mixto
  { status: "COMPLETADA", createdAt: day, paymentMode: "MULTI", totalAmount: 9, paidUSD: 5, paidMN: 1320,
    items: [{ productId: "r", name: "Líquido de frenos", brand: "Royal", quantity: 2, subtotal: 9 }] },
  { status: "CANCELADA", createdAt: day, currency: "USD", totalAmount: 100, paidUSD: 100, items: [] },
];

describe("v5.24.0 · cierre de caja", () => {
  it("suma cada moneda en su moneda y agrupa por marca", () => {
    const st = computeClosureStats(sales, {});
    expect(st.byCurrency.USD.amount).toBe(27);
    expect(st.byCurrency.MN.amount).toBe(8360);
    expect(st.byBrand.map((b) => [b.brand, b.units, b.total])).toEqual([["MANNOL", 2, 44], ["Royal", 2, 9]]);
  });

  it("arqueo: fondo + ventas en efectivo vs. lo contado", () => {
    const st = computeClosureStats(sales, {});
    const cash = computeCashCount({ stats: st, opening: { USD: 20, MN: 2000 }, counted: { USD: 52, MN: 10360 } });
    const usd = cash.rows.find((r) => r.currency === "USD");
    const mn = cash.rows.find((r) => r.currency === "MN");
    expect(usd).toMatchObject({ opening: 20, sales: 27, expected: 47, counted: 52, diff: 5 });
    expect(mn).toMatchObject({ expected: 10360, diff: 0 });
    expect(cashDiffLabel(usd)).toBe("Sobran 5.00 USD");
    expect(cashDiffLabel(mn)).toBe("Cuadra");
    expect(cash.anyDiff).toBe(true);
    expect(cash.rows.some((r) => r.currency === "EUR")).toBe(false);
  });

  it("sin contar todavía no hay diferencia", () => {
    const cash = computeCashCount({ stats: computeClosureStats(sales, {}), opening: { USD: 20 } });
    expect(cash.rows.find((r) => r.currency === "USD").diff).toBeNull();
    expect(cash.anyDiff).toBe(false);
  });

  it("el texto para WhatsApp incluye marcas, caja y nota", () => {
    const st = computeClosureStats(sales, {});
    const cash = computeCashCount({ stats: st, opening: { USD: 20 }, counted: { USD: 45 } });
    const t = buildClosureShareText({ warehouseName: "Víbora", dateMs: day, stats: st, cash, note: "Una venta no se subió" });
    expect(t).toContain("• MANNOL: 2 u");
    expect(t).toContain("fondo 20.00 USD");
    expect(t).toContain("Faltan 2.00 USD");
    expect(t).toContain("Nota: Una venta no se subió");
  });
});

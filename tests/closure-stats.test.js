// =====================================================
// Tests: cierre de caja (js/sales-stats.js, funciones puras)
// computeClosureStats + closureDateKey
// =====================================================
import { describe, it, expect } from "vitest";
import { computeClosureStats, closureDateKey } from "../js/sales-stats.js";

const DAY = 86400000;
// 2026-06-15 10:00 local
const t = new Date(2026, 5, 15, 10, 0, 0).getTime();
const from = new Date(2026, 5, 15, 0, 0, 0).getTime();

function saleUSD(amount, qty = 1, name = "Producto A", createdAt = t) {
  return {
    status: "COMPLETADA",
    createdAt,
    totalAmount: amount,
    paymentMode: "SINGLE",
    currency: "USD",
    items: [{ productId: `p-${name}`, name, quantity: qty, subtotal: amount }],
  };
}

describe("closureDateKey", () => {
  it("devuelve YYYY-MM-DD local con ceros", () => {
    expect(closureDateKey(t)).toBe("2026-06-15");
    const jan = new Date(2026, 0, 5).getTime();
    expect(closureDateKey(jan)).toBe("2026-01-05");
  });
});

describe("computeClosureStats — filtro de período y estado", () => {
  it("solo cuenta ventas COMPLETADA dentro del rango", () => {
    const sales = [
      saleUSD(25),
      { ...saleUSD(40), status: "CANCELADA" },
      { ...saleUSD(60), createdAt: t - DAY },
      { ...saleUSD(80), createdAt: t + DAY },
    ];
    const s = computeClosureStats(sales, { fromMs: from, toMs: from + DAY });
    expect(s.salesCount).toBe(1);
    expect(s.totalUSD).toBe(25);
  });

  it("sin rango cuenta todo lo completada", () => {
    const s = computeClosureStats([saleUSD(25), saleUSD(40)], {});
    expect(s.salesCount).toBe(2);
    expect(s.totalUSD).toBe(65);
  });
});

describe("computeClosureStats — monedas y pago mixto", () => {
  it("acumula por moneda en ventas SINGLE", () => {
    const sales = [
      saleUSD(25),
      { ...saleUSD(3200), currency: "MN" },
      { ...saleUSD(45), currency: "EUR" },
      { ...saleUSD(112), currency: "TRANSFERENCIA" },
    ];
    const s = computeClosureStats(sales, {});
    expect(s.byCurrency.USD.count).toBe(1);
    expect(s.byCurrency.USD.amount).toBe(25);
    expect(s.byCurrency.MN.amount).toBe(3200);
    expect(s.byCurrency.EUR.amount).toBe(45);
    expect(s.byCurrency.TRANSFERENCIA.amount).toBe(112);
  });

  it("en MULTI reparte por paidUSD/paidMN/paidEUR/paidTransfer", () => {
    const mixed = {
      status: "COMPLETADA",
      createdAt: t,
      totalAmount: 200,
      paymentMode: "MULTI",
      paidUSD: 120,
      paidMN: 6400,
      paidEUR: 0,
      paidTransfer: 80,
      items: [{ productId: "p1", name: "A", quantity: 2, subtotal: 200 }],
    };
    const s = computeClosureStats([mixed], {});
    expect(s.byCurrency.USD.amount).toBe(120);
    expect(s.byCurrency.MN.amount).toBe(6400);
    expect(s.byCurrency.EUR.count).toBe(0);
    expect(s.byCurrency.TRANSFERENCIA.amount).toBe(80);
    expect(s.totalUSD).toBe(200);
  });
});

describe("computeClosureStats — unidades y top productos", () => {
  it("suma unidades y ordena top por cantidad (máx 5)", () => {
    const sales = [
      saleUSD(150, 6, "5W-30"),
      saleUSD(25, 3, "Filtro"),
      saleUSD(30, 1, "0W-20"),
      saleUSD(20, 2, "DOT 4"),
      saleUSD(50, 4, "10W-40"),
      saleUSD(10, 9, "Correa"),
      saleUSD(15, 7, "Refrigerante"),
    ];
    const s = computeClosureStats(sales, {});
    expect(s.unitsSold).toBe(6 + 3 + 1 + 2 + 4 + 9 + 7);
    expect(s.topProducts.length).toBe(5);
    expect(s.topProducts[0].name).toBe("Correa");
    expect(s.topProducts[0].qty).toBe(9);
    // orden descendente por qty
    for (let i = 1; i < s.topProducts.length; i++) {
      expect(s.topProducts[i - 1].qty).toBeGreaterThanOrEqual(s.topProducts[i].qty);
    }
  });

  it("maneja ventas sin items y arrays vacíos", () => {
    const s = computeClosureStats([], { fromMs: from });
    expect(s.salesCount).toBe(0);
    expect(s.unitsSold).toBe(0);
    expect(s.topProducts).toEqual([]);
    expect(s.byCurrency.USD.count).toBe(0);
  });
});

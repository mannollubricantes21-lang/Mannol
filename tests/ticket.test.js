import { describe, it, expect } from "vitest";
import { buildTicketText, cartFromSale, mnRateLabel, paymentSummary } from "../js/ticket.js";

const fmt = (n, c) => `${c} ${Number(n).toFixed(2)}`;
const sale = {
  code: "VIB-1", warehouseName: "Víbora", createdAt: Date.UTC(2026, 10, 25),
  totalAmount: 44, paymentMode: "MULTI",
  payments: [
    { currency: "USD", amount: 5, amountUSD: 5, exchangeRate: 1 },
    { currency: "MN", amount: 12870, amountUSD: 39, exchangeRate: 1 / 330, surchargeMNPerUSD: 10 },
  ],
  items: [
    { productId: "a", name: "Aceite", quantity: 1, unitPrice: 22, subtotal: 22 },
    { productId: "a", name: "Aceite", quantity: 1, unitPrice: 22, subtotal: 22 },
    { productId: "b", name: "Caja", isWholesale: true, boxes: 1, quantity: 12, subtotal: 100 },
  ],
};

describe("v5.21.0 · ticket", () => {
  it("muestra la tasa con recargo en el pago en MN", () => {
    expect(mnRateLabel(sale.payments[1])).toBe("1 USD = 330 MN");
    expect(mnRateLabel(sale.payments[0])).toBe("");
    expect(paymentSummary(sale, fmt)).toBe("USD USD 5.00 + MN MN 12870.00 (1 USD = 330 MN)");
  });
  it("arma el texto del ticket", () => {
    const t = buildTicketText(sale, fmt);
    expect(t).toContain("Venta VIB-1 · Víbora");
    expect(t).toContain("TOTAL: USD 44.00");
    expect(t).toContain("1 caja(s) · Caja");
  });
  it("«Vender de nuevo» junta repetidos y omite mayorista", () => {
    const c = cartFromSale(sale);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ productId: "a", quantity: 2, subtotal: 44 });
  });
});

import { describe, it, expect } from "vitest";
import { normalizeVendorRule, vendorSaleCommission, applyVendorRuleToItems, DEFAULT_VENDOR_RULE } from "../js/vendor-rule.js";
import { itemVendorCommission, saleVendorCommission, computeSellerEarnings, sellerModeOf, saleSellerSlot } from "../js/seller-earnings.js";
import { rowsToTiers, tiersToRows, tierPerBox, parsePercent } from "../js/product-form.js";
import { getSuggestedGestorCommissionPerBox } from "../js/db.js";

describe("regla por venta", () => {
  it("por defecto: desde 25 USD → 1; menos → 0.40", () => {
    expect(vendorSaleCommission(25, null)).toBe(1);
    expect(vendorSaleCommission(80, null)).toBe(1);
    expect(vendorSaleCommission(24.99, null)).toBe(0.4);
    expect(vendorSaleCommission(6, undefined)).toBe(0.4);
    expect(vendorSaleCommission(0, null)).toBe(0);
  });
  it("apagada → null (vale la de cada producto)", () => {
    expect(vendorSaleCommission(30, { enabled: false })).toBeNull();
  });
  it("normaliza texto y valores raros", () => {
    expect(normalizeVendorRule('{"threshold":"30","above":"1,5","below":-1}'))
      .toEqual({ enabled: true, threshold: 30, above: 1.5, below: DEFAULT_VENDOR_RULE.below });
  });
  it("una venta con 4 pomos cobra UNA vez, en el 1.er ítem", () => {
    const items = [
      { productId: "a", quantity: 3, vendorCommission: 50, vendorCommissionCurrency: "MN" },
      { productId: "b", quantity: 1, vendorCommission: 50, vendorCommissionCurrency: "MN", vendorSaleCommission: 9 },
    ];
    const r = applyVendorRuleToItems(items, 40, null);
    expect(r.vendorUSD).toBe(1);
    expect(r.items[0].vendorSaleCommission).toBe(1);
    expect(r.items[1].vendorSaleCommission).toBeUndefined();
    const c = saleVendorCommission({ items: r.items, status: "COMPLETADA" });
    expect(c).toMatchObject({ usd: 1, mn: 0, units: 4 });
  });
  it("regla apagada: se queda la comisión de cada producto", () => {
    const r = applyVendorRuleToItems([{ quantity: 2, vendorCommission: 50, vendorSaleCommission: 1 }], 40, { enabled: false });
    expect(r.vendorUSD).toBeNull();
    expect(saleVendorCommission({ items: r.items })).toMatchObject({ usd: 0, mn: 100 });
  });
  it("itemVendorCommission suma la de la venta", () => {
    expect(itemVendorCommission({ quantity: 2, vendorCommission: 0, vendorCommissionCurrency: "USD", vendorSaleCommission: 0.4 }).usd).toBe(0.4);
  });
});

describe("dos vendedores con PIN", () => {
  const wh = { id: "w", sellerMode: "pin", sellerName: "Marta", sellerWeekendName: "Pedro" };
  const now = new Date(2026, 10, 25, 12).getTime();
  const sale = (slot, total, extra = {}) => ({
    id: Math.random().toString(36), status: "COMPLETADA", createdAt: now - 3600e3, sellerSlot: slot,
    items: applyVendorRuleToItems([{ quantity: 1, name: "X" }], total, null).items, ...extra,
  });
  it("modo", () => {
    expect(sellerModeOf(wh)).toBe("pin");
    expect(sellerModeOf({ sellerWeekendSplit: true })).toBe("weekend");
    expect(sellerModeOf({ sellerMode: "one", sellerWeekendSplit: true })).toBe("weekend");
    expect(sellerModeOf({})).toBe("one");
  });
  it("cada venta cuenta para quien entró (también un sábado)", () => {
    const sat = new Date(2026, 10, 21, 10).getTime();
    const r = computeSellerEarnings([sale(1, 30), sale(2, 10), sale(2, 50, { createdAt: sat })], { warehouse: wh, now });
    expect(r.mode).toBe("pin");
    const [a, b] = r.shifts;
    expect(a).toMatchObject({ key: "seller1", name: "Marta", usd: 1, sales: 1 });
    expect(b).toMatchObject({ key: "seller2", name: "Pedro", usd: 1.4, sales: 2 });
    expect(r.todayKey).toBeNull();
  });
  it("venta sin seller_slot (SQL pendiente): por el nombre", () => {
    expect(saleSellerSlot({ userName: "Pedro" }, wh)).toBe(2);
    expect(saleSellerSlot({ userName: "Empleado · CHB" }, wh)).toBe(1);
  });
});

describe("gestor en % por caja", () => {
  it("'3%' se guarda como porcentaje y vuelve igual", () => {
    expect(parsePercent("3%")).toBe(3);
    expect(parsePercent("3")).toBeNull();
    const { tiers, errors } = rowsToTiers([
      { minBoxes: "1", pricePerUnit: "5", vendorCommission: "", gestorCommission: "0.1" },
      { minBoxes: "10", pricePerUnit: "4.5", vendorCommission: "", gestorCommission: "3%" },
    ]);
    expect(errors).toEqual([]);
    expect(tiers[1]).toMatchObject({ minBoxes: 10, gestorCommission: 0, gestorCommissionPercent: 3 });
    expect(tiers[0].gestorCommissionPercent).toBeUndefined();
    expect(tiersToRows(tiers)[1].gestorCommission).toBe("3%");
    expect(tierPerBox({ pricePerUnit: "4.5", gestorCommission: "3%" }, 12)).toMatchObject({ price: 54, gestor: 1.62, gestorPct: 3 });
  });
  it("porcentaje inválido", () => {
    const { errors } = rowsToTiers([{ pricePerUnit: "5", gestorCommission: "150%" }]);
    expect(errors[0]).toMatchObject({ field: "gestorCommission" });
  });
  it("venta: 3% del precio real de la caja desde 10 cajas", () => {
    const p = { unitsPerBox: 12, wholesaleTiers: [
      { minBoxes: 1, maxBoxes: 9, pricePerUnit: 5, gestorCommission: 0.1 },
      { minBoxes: 10, maxBoxes: null, pricePerUnit: 4.5, gestorCommission: 0, gestorCommissionPercent: 3 },
    ] };
    expect(getSuggestedGestorCommissionPerBox(p, 9)).toBeCloseTo(1.2);
    expect(getSuggestedGestorCommissionPerBox(p, 10)).toBe(1.62);
    expect(getSuggestedGestorCommissionPerBox(p, 10, 60)).toBe(1.8);
  });
});

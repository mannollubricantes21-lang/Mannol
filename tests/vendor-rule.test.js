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
  it("v5.30: ya no se puede apagar (siempre por venta)", () => {
    expect(vendorSaleCommission(30, { enabled: false })).toBe(1);
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
  it("aunque venga guardada como apagada, cobra por venta", () => {
    const r = applyVendorRuleToItems([{ quantity: 2, vendorCommission: 50 }], 40, { enabled: false });
    expect(r.vendorUSD).toBe(1);
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

import { gestorSaleCommission, gestorPercentFor } from "../js/vendor-rule.js";

describe("gestor: 5% ventas normales / 3% por caja (v5.29)", () => {
  const g = { commissionType: "PERCENT", commission: 5, commissionWholesale: 3 };
  it("venta normal paga 5%", () => {
    expect(gestorPercentFor(g, "RETAIL")).toBe(5);
    expect(gestorSaleCommission(g, { total: 200, saleType: "RETAIL" })).toEqual({ usd: 10, mn: 0 });
  });
  it("venta por caja paga 3%", () => {
    expect(gestorPercentFor(g, "WHOLESALE")).toBe(3);
    expect(gestorSaleCommission(g, { total: 1000, saleType: "WHOLESALE" })).toEqual({ usd: 30, mn: 0 });
  });
  it("sin % de caja guardado usa 3 por defecto", () => {
    expect(gestorPercentFor({ commissionType: "PERCENT", commission: 5 }, "WHOLESALE")).toBe(3);
  });
  it("sin gestor no paga nada", () => {
    expect(gestorSaleCommission(null, { total: 100, saleType: "RETAIL" })).toEqual({ usd: 0, mn: 0 });
  });
  it("monto fijo no depende del total", () => {
    const f = { commissionType: "FIXED", commission: 2, commissionCurrency: "USD" };
    expect(gestorPercentFor(f, "RETAIL")).toBeNull();
    expect(gestorSaleCommission(f, { total: 999, saleType: "RETAIL" }).usd).toBe(2);
  });
});

describe("productos con comisión propia (v5.31)", () => {
  const aceite = { productId: "a", quantity: 1, unitPrice: 30, subtotal: 30, vendorCommission: 50, vendorCommissionCurrency: "MN" };
  const cargador = { productId: "c", quantity: 2, unitPrice: 5, subtotal: 10, vendorCommission: 0.5, vendorCommissionCurrency: "USD", ownVendorCommission: true };

  it("va aparte: su fijo por unidad + la regla con el resto", () => {
    const r = applyVendorRuleToItems([cargador, aceite], 40, null);
    expect(r.vendorUSD).toBe(1);            // 30 USD de aceite → 1
    expect(r.fixedUSD).toBe(1);             // 2 cargadores × 0.5
    expect(r.items[0]).toMatchObject({ vendorCommission: 0.5, ownVendorCommission: true });
    expect(r.items[1].vendorSaleCommission).toBe(1);
    expect(saleVendorCommission({ items: r.items })).toMatchObject({ usd: 2, mn: 0 });
  });
  it("no cuenta para llegar a 25: aceite 20 + cargador 10 → 0.40", () => {
    const r = applyVendorRuleToItems([{ ...aceite, subtotal: 20, unitPrice: 20 }, cargador], 30, null);
    expect(r.vendorUSD).toBe(0.4);
  });
  it("solo productos con comisión propia: sin regla", () => {
    const r = applyVendorRuleToItems([cargador], 10, null);
    expect(r.vendorUSD).toBe(0);
    expect(saleVendorCommission({ items: r.items })).toMatchObject({ usd: 1, mn: 0 });
  });
  it("en MN se suma en MN", () => {
    const r = applyVendorRuleToItems([{ ...cargador, vendorCommission: 100, vendorCommissionCurrency: "MN" }], 10, null);
    expect(r.fixedMN).toBe(200);
  });
});

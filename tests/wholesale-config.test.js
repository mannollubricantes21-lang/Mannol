import { describe, it, expect } from "vitest";
import {
  wholesaleConfigOf, validateWholesaleConfig, wholesaleFieldsFrom, wholesaleAvailableIn,
  wholesaleMinBoxes, wholesaleGestorPct, tierPricePerBox,
} from "../js/wholesale-config.js";
import { gestorSaleCommission } from "../js/vendor-rule.js";

describe("Venta mayorista (v5.30)", () => {
  const cfg = { productId: "p1", unitsPerBox: 12, minBoxes: 10, pricePerBox: 95, gestorPct: 3, warehouseIds: ["w1"] };
  const product = { id: "p1", name: "X", ...wholesaleFieldsFrom(cfg) };

  it("guarda y vuelve a leer lo mismo", () => {
    expect(wholesaleConfigOf(product)).toEqual({ unitsPerBox: 12, minBoxes: 10, pricePerBox: 95, gestorPct: 3, warehouseIds: ["w1"], vendorAmount: null, extraTiers: 0 });
    expect(tierPricePerBox(product.wholesaleTiers[0], 12)).toBe(95);
  });
  it("solo sale en los almacenes elegidos (vacío = todos)", () => {
    expect(wholesaleAvailableIn(product, "w1")).toBe(true);
    expect(wholesaleAvailableIn(product, "w2")).toBe(false);
    const all = { ...product, ...wholesaleFieldsFrom({ ...cfg, warehouseIds: null }) };
    expect(wholesaleAvailableIn(all, "w2")).toBe(true);
    expect(wholesaleAvailableIn({ unitsPerBox: null, wholesaleTiers: [] }, "w1")).toBe(false);
  });
  it("quitar deja el producto sin venta por caja", () => {
    expect(wholesaleConfigOf({ ...product, ...wholesaleFieldsFrom(null) })).toBeNull();
  });
  it("productos viejos: mínimo 1 caja, gestor 3 %, precio pomo × caja", () => {
    const old = { unitsPerBox: 6, wholesaleTiers: [{ minBoxes: 1, maxBoxes: 5, pricePerUnit: 22 }, { minBoxes: 6, pricePerUnit: 20 }] };
    expect(wholesaleMinBoxes(old)).toBe(1);
    expect(wholesaleGestorPct(old)).toBe(3);
    expect(wholesaleConfigOf(old)).toMatchObject({ pricePerBox: 132, extraTiers: 1 });
  });
  it("revisa los datos", () => {
    const bad = validateWholesaleConfig({ productId: "", unitsPerBox: "0", minBoxes: "x", pricePerBox: "", gestorPct: "120" });
    expect(Object.keys(bad.errors).sort()).toEqual(["gestorPct", "minBoxes", "pricePerBox", "productId", "unitsPerBox"]);
    const ok = validateWholesaleConfig({ productId: "p", unitsPerBox: "12", minBoxes: "10", pricePerBox: "95,5", gestorPct: "" });
    expect(ok.values).toMatchObject({ pricePerBox: 95.5, gestorPct: 3, warehouseIds: null });
  });
  it("el gestor cobra el % del producto en la venta por caja", () => {
    const g = { commissionType: "FIXED", commission: 2, commissionCurrency: "USD" };
    expect(gestorSaleCommission(g, { total: 950, saleType: "WHOLESALE", wholesalePct: 3 })).toEqual({ usd: 28.5, mn: 0 });
    const p = { commissionType: "PERCENT", commission: 5 };
    expect(gestorSaleCommission(p, { total: 100, saleType: "RETAIL", wholesalePct: 3 }).usd).toBe(5);
  });
});

describe("vendedor en venta por caja (v5.31)", () => {
  it("vacío = regla; con monto se guarda y se lee", () => {
    const base = { productId: "p", unitsPerBox: "12", minBoxes: "10", pricePerBox: "95" };
    expect(validateWholesaleConfig(base).values.vendorAmount).toBeNull();
    const v = validateWholesaleConfig({ ...base, vendorAmount: "5,5" }).values;
    expect(v.vendorAmount).toBe(5.5);
    expect(wholesaleConfigOf({ ...wholesaleFieldsFrom(v) }).vendorAmount).toBe(5.5);
    expect(validateWholesaleConfig({ ...base, vendorAmount: "x" }).errors.vendorAmount).toBeTruthy();
  });
});

import { wholesaleNeedsReview, wholesaleShortages } from "../js/wholesale-config.js";

describe("v5.32: revisar y faltantes por caja", () => {
  const nuevo = { id: "n", name: "Nuevo", unitsPerBox: 12, ...wholesaleFieldsFrom({ unitsPerBox: 12, minBoxes: 10, pricePerBox: 95, gestorPct: 3, warehouseIds: null }) };
  const viejo = { id: "v", name: "Viejo", unitsPerBox: 6, wholesaleTiers: [{ minBoxes: 1, pricePerUnit: 20 }] };
  it("marca para revisar solo los del formato viejo", () => {
    expect(wholesaleNeedsReview(nuevo)).toBe(false);
    expect(wholesaleNeedsReview(viejo)).toBe(true);
    expect(wholesaleNeedsReview({ unitsPerBox: null, wholesaleTiers: [] })).toBe(false);
  });
  it("avisa cuando no llegan al mínimo de cajas en el almacén", () => {
    const r = wholesaleShortages([nuevo, viejo], { n: 100, v: 6 }, "w1");
    expect(r).toEqual([{ productId: "n", name: "Nuevo", boxes: 8, minBoxes: 10, missingUnits: 20 }]);
    expect(wholesaleShortages([nuevo], { n: 120 }, "w1")).toEqual([]);
    const soloOtro = { ...nuevo, ...wholesaleFieldsFrom({ unitsPerBox: 12, minBoxes: 10, pricePerBox: 95, gestorPct: 3, warehouseIds: ["w2"] }) };
    expect(wholesaleShortages([soloOtro], { n: 0 }, "w1")).toEqual([]);
  });
});

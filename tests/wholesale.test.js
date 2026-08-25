// =====================================================
// Tests: Wholesale tier helpers
// =====================================================
import { describe, it, expect } from "vitest";
import {
  getWholesaleTier,
  getSuggestedPricePerBox,
  getSuggestedVendorCommissionPerBox,
  getSuggestedGestorCommissionPerBox,
  isWholesaleProduct,
} from "../js/db.js";

describe("getWholesaleTier", () => {
  const product = {
    unitsPerBox: 6,
    wholesaleTiers: [
      { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
      { minBoxes: 6, maxBoxes: 20, pricePerUnit: 20, vendorCommission: 0.75, gestorCommission: 0.4 },
      { minBoxes: 21, maxBoxes: null, pricePerUnit: 18, vendorCommission: 1.0, gestorCommission: 0.5 },
    ],
  };

  it("devuelve el tier correcto según cantidad de cajas", () => {
    expect(getWholesaleTier(product, 1).pricePerUnit).toBe(22);
    expect(getWholesaleTier(product, 5).pricePerUnit).toBe(22);
    expect(getWholesaleTier(product, 6).pricePerUnit).toBe(20);
    expect(getWholesaleTier(product, 20).pricePerUnit).toBe(20);
    expect(getWholesaleTier(product, 21).pricePerUnit).toBe(18);
    expect(getWholesaleTier(product, 100).pricePerUnit).toBe(18);
  });

  it("devuelve null si no hay tiers", () => {
    expect(getWholesaleTier({ wholesaleTiers: [] }, 5)).toBe(null);
    expect(getWholesaleTier({ wholesaleTiers: null }, 5)).toBe(null);
    expect(getWholesaleTier(null, 5)).toBe(null);
  });

  it("devuelve el primer tier si boxes < min del primer tier", () => {
    expect(getWholesaleTier(product, 0).pricePerUnit).toBe(22);
  });

  it("maneja tiers desordenados (los ordena internamente)", () => {
    const unordered = {
      wholesaleTiers: [
        { minBoxes: 21, maxBoxes: null, pricePerUnit: 18, vendorCommission: 1.0, gestorCommission: 0.5 },
        { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
        { minBoxes: 6, maxBoxes: 20, pricePerUnit: 20, vendorCommission: 0.75, gestorCommission: 0.4 },
      ],
    };
    expect(getWholesaleTier(unordered, 5).pricePerUnit).toBe(22);
    expect(getWholesaleTier(unordered, 10).pricePerUnit).toBe(20);
    expect(getWholesaleTier(unordered, 50).pricePerUnit).toBe(18);
  });
});

describe("getSuggestedPricePerBox", () => {
  it("calcula precio total por caja", () => {
    const product = {
      unitsPerBox: 6,
      wholesaleTiers: [
        { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
      ],
    };
    expect(getSuggestedPricePerBox(product, 3)).toBe(132); // 22 * 6
  });

  it("devuelve null si no es producto mayorista", () => {
    expect(getSuggestedPricePerBox({ unitsPerBox: null, wholesaleTiers: [] }, 5)).toBe(null);
    expect(getSuggestedPricePerBox(null, 5)).toBe(null);
  });
});

describe("getSuggestedVendorCommissionPerBox", () => {
  it("calcula comisión vendedor por caja", () => {
    const product = {
      unitsPerBox: 6,
      wholesaleTiers: [
        { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
      ],
    };
    expect(getSuggestedVendorCommissionPerBox(product, 3)).toBe(3); // 0.5 * 6
  });
});

describe("getSuggestedGestorCommissionPerBox", () => {
  it("calcula comisión gestor por caja", () => {
    const product = {
      unitsPerBox: 6,
      wholesaleTiers: [
        { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
      ],
    };
    expect(getSuggestedGestorCommissionPerBox(product, 3)).toBeCloseTo(1.8); // 0.3 * 6
  });
});

describe("isWholesaleProduct", () => {
  it("true si tiene unitsPerBox y tiers", () => {
    expect(isWholesaleProduct({ unitsPerBox: 6, wholesaleTiers: [{ minBoxes: 1 }] })).toBe(true);
  });

  it("false sin unitsPerBox", () => {
    expect(isWholesaleProduct({ wholesaleTiers: [{ minBoxes: 1 }] })).toBe(false);
  });

  it("false sin tiers", () => {
    expect(isWholesaleProduct({ unitsPerBox: 6, wholesaleTiers: [] })).toBe(false);
  });

  it("false con null", () => {
    expect(isWholesaleProduct(null)).toBe(false);
  });
});

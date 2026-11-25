// =====================================================
// Tests: cálculo de comisiones del carrito (camino del dinero)
// Helper puro usado por views/sales.js en el checkout retail.
// =====================================================
import { describe, it, expect } from "vitest";
import { sumCartCommissions } from "../js/db.js";

describe("sumCartCommissions", () => {
  it("suma comisiones USD y MN por separado", () => {
    const cart = [
      { quantity: 2, gestorCommission: 1, gestorCommissionCurrency: "USD", vendorCommission: 5, vendorCommissionCurrency: "MN" },
      { quantity: 3, gestorCommission: 0.5, gestorCommissionCurrency: "USD", vendorCommission: 2, vendorCommissionCurrency: "MN" },
    ];
    const r = sumCartCommissions(cart);
    expect(r.gestorCommissionUSD).toBeCloseTo(3.5);
    expect(r.gestorCommissionMN).toBe(0);
    expect(r.vendorCommissionUSD).toBe(0);
    expect(r.vendorCommissionMN).toBeCloseTo(16);
  });

  it("aplica defaults USD (gestor) y MN (vendedor) cuando falta la moneda", () => {
    const r = sumCartCommissions([{ quantity: 1, gestorCommission: 1, vendorCommission: 4 }]);
    expect(r.gestorCommissionUSD).toBe(1);
    expect(r.gestorCommissionMN).toBe(0);
    expect(r.vendorCommissionUSD).toBe(0);
    expect(r.vendorCommissionMN).toBe(4);
  });

  it("acepta comisiones de vendedor en USD", () => {
    const r = sumCartCommissions([{ quantity: 2, vendorCommission: 0.25, vendorCommissionCurrency: "USD" }]);
    expect(r.vendorCommissionUSD).toBeCloseTo(0.5);
    expect(r.vendorCommissionMN).toBe(0);
  });

  it("mezcla monedas distintas en el mismo carrito sin mezclar totales", () => {
    const cart = [
      { quantity: 1, gestorCommission: 2, gestorCommissionCurrency: "USD", vendorCommission: 1, vendorCommissionCurrency: "USD" },
      { quantity: 1, gestorCommission: 10, gestorCommissionCurrency: "MN", vendorCommission: 20, vendorCommissionCurrency: "MN" },
    ];
    const r = sumCartCommissions(cart);
    expect(r.gestorCommissionUSD).toBe(2);
    expect(r.gestorCommissionMN).toBe(10);
    expect(r.vendorCommissionUSD).toBe(1);
    expect(r.vendorCommissionMN).toBe(20);
  });

  it("carrito vacío o nulo devuelve todo en cero", () => {
    const r = sumCartCommissions([]);
    expect(r.gestorCommissionUSD + r.gestorCommissionMN + r.vendorCommissionUSD + r.vendorCommissionMN).toBe(0);
    const r2 = sumCartCommissions(null);
    expect(r2.gestorCommissionUSD + r2.vendorCommissionMN).toBe(0);
  });

  it("item sin comisiones definidas no suma nada", () => {
    const r = sumCartCommissions([{ quantity: 10, name: "aceite" }]);
    expect(r.gestorCommissionUSD + r.gestorCommissionMN + r.vendorCommissionUSD + r.vendorCommissionMN).toBe(0);
  });
});

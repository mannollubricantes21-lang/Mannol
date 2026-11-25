// =====================================================
// Tests: códigos de venta con prefijo de almacén (v5.13.0)
// "VIB-2QK8ZT7M": nunca se confunden ventas de almacenes distintos.
// =====================================================
import { describe, it, expect } from "vitest";
import { generateSaleCode, sanitizeWarehouseCode } from "../js/currency.js";

const FORMAT = /^[A-Z0-9]{1,4}-[0-9A-HJKMNP-TV-Z]{8}$/; // Crockford base32 (sin I, L, O, U)

describe("sanitizeWarehouseCode", () => {
  it("normaliza el código del almacén", () => {
    expect(sanitizeWarehouseCode("VIB")).toBe("VIB");
    expect(sanitizeWarehouseCode("lís")).toBe("LIS");
    expect(sanitizeWarehouseCode(" c-h b ")).toBe("CHB");
    expect(sanitizeWarehouseCode("PLAYA")).toBe("PLAY"); // máx. 4
    expect(sanitizeWarehouseCode("")).toBe("V");
    expect(sanitizeWarehouseCode(null)).toBe("V");
    expect(sanitizeWarehouseCode("ñ")).toBe("N");
  });
});

describe("generateSaleCode", () => {
  it("lleva el prefijo del almacén y el formato esperado", () => {
    const c = generateSaleCode("VIB");
    expect(c).toMatch(FORMAT);
    expect(c.startsWith("VIB-")).toBe(true);
    expect(generateSaleCode("Lisa")).toMatch(/^LISA-/);
  });

  it("dos almacenes en el mismo segundo y con el mismo azar dan códigos distintos", () => {
    const now = Date.UTC(2026, 10, 23, 15, 30, 0);
    const rand = () => 0.5;
    expect(generateSaleCode("VIB", now, rand)).not.toBe(generateSaleCode("LIS", now, rand));
  });

  it("es ordenable por tiempo dentro del almacén", () => {
    const rand = () => 0;
    const a = generateSaleCode("VIB", Date.UTC(2026, 0, 1), rand);
    const b = generateSaleCode("VIB", Date.UTC(2026, 0, 1, 0, 0, 1), rand);
    const c = generateSaleCode("VIB", Date.UTC(2027, 5, 1), rand);
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it("no se repite cada 100 s como el código anterior (V-xxxxx)", () => {
    const rand = () => 0.25;
    const t = Date.UTC(2026, 10, 23, 12, 0, 0);
    expect(generateSaleCode("VIB", t, rand)).not.toBe(generateSaleCode("VIB", t + 100_000, rand));
  });

  it("10 000 códigos del mismo almacén en un minuto: sin repetidos", () => {
    const t0 = Date.UTC(2026, 10, 23, 12, 0, 0);
    const set = new Set();
    for (let i = 0; i < 10_000; i++) set.add(generateSaleCode("VIB", t0 + (i % 60) * 1000));
    // 60 segundos × 1024 sufijos → algún choque es posible, pero muy pocos
    expect(set.size).toBeGreaterThan(9_000);
  });

  it("aguanta azar fuera de rango y fechas anteriores a 2024", () => {
    expect(generateSaleCode("VIB", 0, () => 1)).toMatch(FORMAT);
    expect(generateSaleCode("VIB", Date.now(), () => -3)).toMatch(FORMAT);
  });
});

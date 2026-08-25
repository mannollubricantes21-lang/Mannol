// =====================================================
// Tests: Currency formatting + ID generation
// =====================================================
import { describe, it, expect } from "vitest";
import { formatMoney, generateSaleId, generateId, maskCard } from "../js/currency.js";

describe("formatMoney", () => {
  it("formatea USD con $", () => {
    expect(formatMoney(10, "USD")).toBe("$10.00");
    expect(formatMoney(1234.5, "USD")).toBe("$1234.50");
  });

  it("formatea MN con ₱", () => {
    expect(formatMoney(100, "MN")).toBe("₱100.00");
  });

  it("formatea EUR con €", () => {
    expect(formatMoney(50, "EUR")).toBe("€50.00");
  });

  it("formatea TRANSFER/TRANSFERENCIA con ₱", () => {
    expect(formatMoney(25, "TRANSFERENCIA")).toBe("₱25.00");
    expect(formatMoney(25, "TRANSFER")).toBe("₱25.00");
  });

  it("maneja null y undefined", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
  });

  it("maneja 0 y negativos", () => {
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(-5, "USD")).toBe("$-5.00");
  });
});

describe("generateSaleId", () => {
  it("genera ID con prefijo S-", () => {
    const id = generateSaleId();
    expect(id).toMatch(/^S-\d+-[A-Z0-9]+$/);
  });

  it("dos IDs son distintos", () => {
    const a = generateSaleId();
    const b = generateSaleId();
    expect(a).not.toBe(b);
  });
});

describe("generateId", () => {
  it("genera ID sin prefijo", () => {
    const id = generateId();
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe("maskCard", () => {
  it("enmascara los primeros dígitos", () => {
    expect(maskCard("9225678901234567")).toBe("**** 4567");
  });

  it("devuelve **** para null", () => {
    expect(maskCard(null)).toBe("****");
  });

  it("devuelve **** para string corto", () => {
    expect(maskCard("123")).toBe("****");
  });

  it("maneja guiones", () => {
    expect(maskCard("9225-6789-0123-4567")).toBe("**** 4567");
  });
});

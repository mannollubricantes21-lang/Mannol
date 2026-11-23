// =====================================================
// Tests: helpers de PIN (js/pin-utils.js, puro) — v5.6.1
// =====================================================
import { describe, it, expect } from "vitest";
import { normalizePin, resolveExpectedPin, pinMatches } from "../js/pin-utils.js";

describe("normalizePin", () => {
  it("convierte número a string", () => {
    expect(normalizePin(2611)).toBe("2611");
  });
  it("hace trim de espacios", () => {
    expect(normalizePin("  2611 ")).toBe("2611");
  });
  it("null/undefined → string vacío", () => {
    expect(normalizePin(null)).toBe("");
    expect(normalizePin(undefined)).toBe("");
  });
});

describe("resolveExpectedPin", () => {
  it("el pin del almacén tiene prioridad sobre el global", () => {
    expect(resolveExpectedPin({ pin: "2611" }, { pinCode: "2025" })).toBe("2611");
  });
  it("cae al pinCode global si el almacén no tiene", () => {
    expect(resolveExpectedPin({ pin: "" }, { pinCode: "2025" })).toBe("2025");
    expect(resolveExpectedPin({ pin: null }, { pinCode: "5555" })).toBe("5555");
  });
  it("pin numérico del almacén funciona (bug v5.6: string !== number)", () => {
    expect(resolveExpectedPin({ pin: 2611 }, { pinCode: "2025" })).toBe("2611");
  });
  it("pinCode null en settings no pisa el default del llamador", () => {
    // getSettings ya aplica el guard, pero el helper también es defensivo
    expect(resolveExpectedPin({ pin: "" }, { pinCode: null })).toBeNull();
  });
  it("sin ninguno configurado → null (no '2025' inventado)", () => {
    expect(resolveExpectedPin({}, {})).toBeNull();
  });
});

describe("pinMatches", () => {
  it("string vs número (caso real de Supabase)", () => {
    expect(pinMatches("2611", 2611)).toBe(true);
  });
  it("con espacios en cualquiera de las dos partes", () => {
    expect(pinMatches(" 2611", "2611 ")).toBe(true);
  });
  it("pin distinto → false", () => {
    expect(pinMatches("1111", "2611")).toBe(false);
  });
  it("esperado null/vacío → siempre false (nada coincide)", () => {
    expect(pinMatches("2611", null)).toBe(false);
    expect(pinMatches("2611", "")).toBe(false);
  });
});

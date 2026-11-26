import { describe, it, expect } from "vitest";
import { normalizeAppearance, accentVars, DEFAULT_APPEARANCE, ACCENTS } from "../js/appearance.js";

describe("normalizeAppearance", () => {
  it("devuelve los valores por defecto con basura", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ accent: "x", font: 3, background: "neon", catalogView: "grid" })).toEqual(DEFAULT_APPEARANCE);
  });
  it("conserva valores válidos", () => {
    expect(normalizeAppearance({ accent: "dorado", background: "dark", font: "lg", catalogView: "large" }))
      .toEqual({ accent: "dorado", background: "dark", font: "lg", catalogView: "large" });
  });
  it("convierte las vistas de antes (lista / tarjetas)", () => {
    expect(normalizeAppearance({ catalogView: "list" }).catalogView).toBe("details");
    expect(normalizeAppearance({ catalogView: "cards" }).catalogView).toBe("medium");
  });
});

describe("accentVars", () => {
  it("el verde MANNOL no pisa variables", () => {
    expect(accentVars("mannol", true)).toEqual({});
    expect(accentVars("desconocido", false)).toEqual({});
  });
  it("dorado usa el tono oscuro y texto oscuro sobre el botón", () => {
    const v = accentVars("dorado", true);
    expect(v["--primary"]).toBe(ACCENTS.dorado.dark);
    expect(v["--primary-foreground"]).toBe(ACCENTS.dorado.fgDark);
    expect(Object.keys(v)).toHaveLength(5);
  });
  it("modo claro usa el tono claro", () => {
    expect(accentVars("azul", false)["--primary"]).toBe(ACCENTS.azul.light);
  });
});

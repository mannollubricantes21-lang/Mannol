import { describe, it, expect } from "vitest";
import { normalizeAppearance, accentVars, DEFAULT_APPEARANCE, ACCENTS } from "../js/appearance.js";

describe("normalizeAppearance", () => {
  it("devuelve los valores por defecto con basura", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ accent: "x", font: 3, background: "neon", catalogView: "grid" })).toEqual(DEFAULT_APPEARANCE);
  });
  it("conserva valores válidos", () => {
    expect(normalizeAppearance({ accent: "dorado", background: "dark", font: "lg", catalogView: "large" }))
      .toEqual({ accent: "dorado", background: "dark", font: "lg", catalogView: "large", palette: "normal" });
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

import { getAppearance, saveAppearance, sellerSlotOf } from "../js/appearance.js";

describe("v5.32.2: cada vendedor su apariencia", () => {
  it("lo que guarda un vendedor no cambia al otro", () => {
    localStorage.clear();
    saveAppearance("wh1", { accent: "azul" });            // la del almacén (de antes)
    expect(getAppearance("wh1", 2).accent).toBe("azul");  // parte de esa
    saveAppearance("wh1", { accent: "rojo", font: "xl" }, 1);
    expect(getAppearance("wh1", 1)).toMatchObject({ accent: "rojo", font: "xl" });
    expect(getAppearance("wh1", 2).accent).toBe("azul");
    saveAppearance("wh1", { accent: "violeta" }, 2);
    expect(getAppearance("wh1", 1).accent).toBe("rojo");
    expect(getAppearance("wh1", 2).accent).toBe("violeta");
  });
  it("sellerSlotOf", () => {
    expect(sellerSlotOf({ sellerSlot: 2 })).toBe(2);
    expect(sellerSlotOf({ sellerSlot: null })).toBeNull();
    expect(sellerSlotOf(null)).toBeNull();
  });
});

import { paletteVars, PALETTES } from "../js/appearance.js";
describe("v5.33: paletas", () => {
  it("normal no cambia nada; las demás cambian fondo, tarjetas y textos", () => {
    expect(paletteVars("normal", false)).toEqual({});
    for (const k of Object.keys(PALETTES).filter((x) => x !== "normal")) {
      for (const dark of [false, true]) {
        const v = paletteVars(k, dark);
        expect(v["--bg"]).toBeTruthy();
        expect(v["--bg-elevated"]).toBeTruthy();
        expect(v["--text"]).toBeTruthy();
        expect(v["--card-line"]).toBeTruthy();
      }
    }
  });
  it("paleta desconocida → normal", () => {
    expect(normalizeAppearance({ palette: "neon" }).palette).toBe("normal");
    expect(normalizeAppearance({ palette: "arena" }).palette).toBe("arena");
  });
});

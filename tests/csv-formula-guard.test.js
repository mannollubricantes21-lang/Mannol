// =====================================================
// Tests v5.39.2 — hallazgo 10: neutralización de fórmulas en el CSV
// Al abrir el export en Excel/Sheets, una celda que empiece por
// = + - @ o tabulador se ejecuta como fórmula. Los números reales
// con signo pasan intactos.
// =====================================================
import { describe, it, expect } from "vitest";
import { escapeCSV, exportToCSV } from "../js/csv-export.js";

describe("escapeCSV — guardia anti-fórmulas", () => {
  it("prefija apóstrofe a las fórmulas =", () => {
    expect(escapeCSV("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("cita la fórmula si además contiene coma", () => {
    expect(escapeCSV("=SUM(A1,B2)")).toBe('"\'=SUM(A1,B2)"');
  });

  it("prefija apóstrofe a @ y tabulador iniciales", () => {
    expect(escapeCSV("@nota")).toBe("'@nota");
    expect(escapeCSV("\tx")).toBe("'\tx");
  });

  it("prefija apóstrofe al + no numérico (teléfonos, texto)", () => {
    expect(escapeCSV("+53 5xxxxxxx")).toBe("'+53 5xxxxxxx");
  });

  it("prefija apóstrofe al - que no es número (texto guiones)", () => {
    expect(escapeCSV("-caso especial")).toBe("'-caso especial");
  });

  it("deja los números reales intactos (montos con signo)", () => {
    expect(escapeCSV("-5")).toBe("-5");
    expect(escapeCSV("+2.5")).toBe("+2.5");
    expect(escapeCSV("5.5")).toBe("5.5");
    expect(escapeCSV("1500")).toBe("1500");
  });

  it("no toca el texto normal", () => {
    expect(escapeCSV("MANNOL 5W-30")).toBe("MANNOL 5W-30");
    expect(escapeCSV("Cliente Centro")).toBe("Cliente Centro");
  });

  it("conserva el escapado original de comas y comillas", () => {
    expect(escapeCSV("a,b")).toBe('"a,b"');
    expect(escapeCSV('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it("vacío y null siguen devolviendo cadena vacía", () => {
    expect(escapeCSV(null)).toBe("");
    expect(escapeCSV(undefined)).toBe("");
    expect(escapeCSV("")).toBe("");
  });
});

describe("exportToCSV — sigue generando CSV usable", () => {
  it("no explota con filas normales y respeta columnas", () => {
    // jsdom no trae URL.createObjectURL: se stubbea solo para este test
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:fake";
    URL.revokeObjectURL = () => {};
    try {
      expect(() => exportToCSV("prueba", [{ nombre: "Ok", monto: -5 }], ["nombre", "monto"])).not.toThrow();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});

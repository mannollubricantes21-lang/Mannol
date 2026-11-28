// =====================================================
// Tests v5.39.2 — hallazgo 9: el respaldo de tasa.json sobrevive
// a las actualizaciones. El handler network-first de tasa.json debe
// guardar el respaldo en DATA_CACHE (que activate conserva), NO en
// la caché de versión (que se borra en cada release).
// Verificación por fuente, al estilo de sw-precache.test.js.
// =====================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const sw = readFileSync(resolve(ROOT, "sw.js"), "utf8");

function tasaHandler() {
  const ini = sw.indexOf('endsWith("/tasa.json")');
  expect(ini).toBeGreaterThan(0);
  // el bloque termina donde empieza el handler de assets estáticos
  const fin = sw.indexOf("// Static assets", ini);
  expect(fin).toBeGreaterThan(ini);
  return sw.slice(ini, fin);
}

describe("service worker — respaldo de tasa.json", () => {
  it("el handler de tasa.json usa DATA_CACHE para el respaldo", () => {
    const bloque = tasaHandler();
    expect(bloque).toContain("caches.open(DATA_CACHE)");
  });

  it("el handler de tasa.json NO referencia la caché de versión", () => {
    const bloque = tasaHandler();
    expect(bloque).not.toMatch(/caches\.open\(CACHE_VERSION\)/);
  });

  it("activate conserva DATA_CACHE entre releases", () => {
    // La caché de datos (y su tasa guardada) no se elimina al actualizar
    const activar = sw.slice(sw.indexOf('addEventListener("activate"'), sw.indexOf("clients.claim"));
    expect(activar).toContain("k !== CACHE_VERSION && k !== DATA_CACHE");
  });

  it("el bloque de STATIC_ASSETS incluye js/error-report.js", () => {
    // v5.39.2: el módulo nuevo entra en el precache (lo exige sw-precache)
    expect(sw).toContain('"./js/error-report.js"');
  });
});

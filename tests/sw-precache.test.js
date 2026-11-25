// =====================================================
// Tests: todo módulo que la app o el admin cargan al abrir está en la caché del
// service worker (si falta uno, sin conexión la pantalla no abre).
// Recorre los `import ... from "./x.js"` estáticos desde js/app.js y js/admin-app.js.
// =====================================================
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";

const ROOT = resolve(__dirname, "..");
const sw = readFileSync(resolve(ROOT, "sw.js"), "utf8");
const precached = new Set([...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]));
// Se toleran: la config real (puede no existir) y las que se piden al usarse
const OPTIONAL = new Set(["js/github-config.js"]);

function staticImports(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*import\s+["'](\.{1,2}\/[^"']+)["']/gm)) out.push(m[1]);
  return out.map((spec) => resolve(dirname(file), spec));
}

function graph(entry) {
  const seen = new Set();
  const stack = [resolve(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (!existsSync(f)) continue;
    stack.push(...staticImports(f));
  }
  return [...seen].map((f) => relative(ROOT, f).split("\\").join("/"));
}

describe("caché del service worker", () => {
  for (const entry of ["js/app.js", "js/admin-app.js"]) {
    it(`${entry}: todos sus módulos están precargados`, () => {
      const files = graph(entry);
      expect(files.length).toBeGreaterThan(10);
      const missing = files.filter((f) => !precached.has(f) && !OPTIONAL.has(f));
      expect(missing).toEqual([]);
    });
  }
  it("incluye el formulario de producto nuevo (v5.15.0)", () => {
    expect(precached.has("js/product-form.js")).toBe(true);
    expect(precached.has("js/views/product-dialog.js")).toBe(true);
  });
});

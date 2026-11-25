// v5.13.1 — Logo e íconos de la app:
//   · todo ícono declarado (manifest, index.html, admin.html, logo de la cabecera) existe
//     y mide lo que dice;
//   · los "maskable" y el de iOS son opacos y a sangre (Android/iOS recortan la forma; con
//     transparencia salían esquinas negras o un borde raro);
//   · el service worker los guarda → el logo también se ve sin conexión.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const text = (p) => readFileSync(resolve(root, p), "utf8");
const norm = (src) => src.replace(/^\.\//, "");

function png(path) {
  const b = readFileSync(resolve(root, path));
  expect(b.subarray(1, 4).toString("latin1"), `${path} no es PNG`).toBe("PNG");
  // IHDR: ancho, alto (big-endian) y tipo de color (2 = RGB opaco, 6 = RGBA)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

const manifest = JSON.parse(text("manifest.webmanifest"));
const sw = text("sw.js");
const precache = new Set([...sw.matchAll(/"\.\/(icons\/[^"]+)"/g)].map((m) => m[1]));

function htmlIcons(file) {
  return [...text(file).matchAll(/<link\s+rel="(icon|apple-touch-icon|shortcut icon)"[^>]*>/g)].map((m) => {
    const tag = m[0];
    return {
      rel: m[1],
      href: norm(/href="([^"]+)"/.exec(tag)[1]),
      sizes: (/sizes="([^"]+)"/.exec(tag) || [])[1] || null,
    };
  });
}

describe("íconos del manifest", () => {
  it("existen y miden lo declarado", () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    for (const ic of manifest.icons) {
      const path = norm(ic.src);
      expect(existsSync(resolve(root, path)), path).toBe(true);
      const { width, height } = png(path);
      expect(`${width}x${height}`, path).toBe(ic.sizes);
    }
  });

  it("los maskable son opacos (RGB, a sangre) y hay 192 y 512", () => {
    const maskable = manifest.icons.filter((ic) => (ic.purpose || "").includes("maskable"));
    expect(maskable.map((ic) => ic.sizes).sort()).toEqual(["192x192", "512x512"]);
    for (const ic of maskable) expect(png(norm(ic.src)).colorType, ic.src).toBe(2);
  });

  it("hay íconos 'any' de 192 y 512", () => {
    const any = manifest.icons.filter((ic) => !ic.purpose || ic.purpose.includes("any"));
    const sizes = any.map((ic) => ic.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});

describe("íconos de las páginas", () => {
  for (const file of ["index.html", "admin.html"]) {
    it(`${file}: favicon e ícono de iOS existen y miden lo declarado`, () => {
      const links = htmlIcons(file);
      expect(links.some((l) => l.rel === "icon")).toBe(true);
      const apple = links.find((l) => l.rel === "apple-touch-icon");
      expect(apple, `${file} sin apple-touch-icon`).toBeTruthy();
      for (const l of links) {
        expect(existsSync(resolve(root, l.href)), `${file} → ${l.href}`).toBe(true);
        const { width, height } = png(l.href);
        if (l.sizes) expect(`${width}x${height}`, l.href).toBe(l.sizes);
      }
      // iOS: 180×180 y opaco (con transparencia iOS pinta las esquinas de negro)
      const info = png(apple.href);
      expect([info.width, info.height, info.colorType]).toEqual([180, 180, 2]);
    });
  }
});

describe("logo dentro de la app", () => {
  const ui = text("js/ui.js");
  const src = norm(/brandMark\(\)\s*\{[\s\S]*?src="([^"]+)"/.exec(ui)[1]);

  it("brandMark() apunta a un PNG cuadrado y nítido (≥ 108 px para pantallas 3x)", () => {
    const { width, height } = png(src);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(108);
  });

  it("ya no queda la gota genérica como logo en las cabeceras", () => {
    for (const f of ["js/views/dashboard.js", "js/views/home.js", "js/views/admin.js", "js/admin-app.js"]) {
      const s = text(f);
      expect(s, f).not.toMatch(/class="brand-logo"[^>]*>\s*\$\{icon\("droplet"/);
      expect(s, f).toMatch(/brand-logo--mark/);
    }
  });

  it("el service worker guarda todos los íconos (se ven sin conexión)", () => {
    const needed = new Set([
      ...manifest.icons.map((ic) => norm(ic.src)),
      ...htmlIcons("index.html").map((l) => l.href),
      ...htmlIcons("admin.html").map((l) => l.href),
      src,
    ]);
    const missing = [...needed].filter((p) => !precache.has(p));
    expect(missing).toEqual([]);
  });
});

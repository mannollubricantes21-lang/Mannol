// =====================================================
// Tests v5.39.6 — Lote B3 de la auditoría UX/WCAG:
//  · global-search ya no monta un overlay div a mano: usa el dialog nativo
//    del sistema vía showModal() de ui.js (como todo modal desde v5.39.4).
//  · Escala de tokens a :root (espaciado 4/8 + tipografía) en mobile-ux.css.
//  · Foco visible estandarizado (:focus-visible 2px) sigue en styles.css.
// =====================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { setupGlobalSearch } from "../js/global-search.js";

const ROOT = resolve(__dirname, "..");
const gsSrc = readFileSync(resolve(ROOT, "js/global-search.js"), "utf8");
const mobileCss = readFileSync(resolve(ROOT, "css/mobile-ux.css"), "utf8");
const stylesCss = readFileSync(resolve(ROOT, "css/styles.css"), "utf8");

// El listener de Ctrl+K se instala UNA vez (guard _installed) y queda en el
// document: un único spy compartido para todos los tests del archivo.
const navigate = vi.fn();

describe("B3: búsqueda global con dialog nativo", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="modal-container"></div><div id="toast-container"></div>`;
    navigate.mockClear();
    setupGlobalSearch(navigate); // idempotente tras la primera llamada
  });

  it("el código ya no crea el overlay div a mano", () => {
    expect(gsSrc).not.toContain('.className = "modal-overlay"');
    expect(gsSrc).toContain("showModal({");
    expect(gsSrc).toContain("noHeader: true");
  });

  it("Ctrl+K abre un <dialog> real con el input y aria-label", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    const dlg = document.querySelector("#modal-container dialog.modal-overlay");
    expect(dlg).toBeInstanceOf(HTMLDialogElement);
    expect(dlg.getAttribute("aria-label")).toBe("Búsqueda global");
    expect(dlg.querySelector("#gs-input")).toBeTruthy();
    expect(dlg.querySelector("#gs-results")).toBeTruthy();
  });

  it("Enter sobre el primer resultado navega y cierra", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    const input = document.querySelector("#gs-input");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(navigate).toHaveBeenCalledWith("dashboard");
    expect(document.querySelector("#modal-container dialog.modal-overlay")).toBeNull();
  });

  it("Escape cierra (vía input y vía documento en el fallback)", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    const input = document.querySelector("#gs-input");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector("#modal-container dialog.modal-overlay")).toBeNull();
  });
});

describe("B3: tokens y foco", () => {
  it("mobile-ux.css define la escala de espaciado y tipografía", () => {
    for (const token of ["--space-1", "--space-4", "--space-8", "--text-xs", "--text-base", "--text-xl", "--leading-normal"]) {
      expect(mobileCss).toContain(`${token}:`);
    }
  });

  it("styles.css mantiene el foco visible estandarizado de 2px", () => {
    expect(stylesCss).toMatch(/:focus-visible\s*{\s*outline:\s*2px/);
  });
});

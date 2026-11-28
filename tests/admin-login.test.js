// =====================================================
// Test v5.39.2 — el login del panel admin acepta nombre de usuario.
// Desde v5.20.0 se puede entrar con usuario o email (RPC
// email_for_username), pero el input del admin era type="email" y
// la validación nativa del navegador rechazaba «admin» sin @ antes
// de llegar a la lógica — en demo era imposible entrar al panel.
// =====================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const src = readFileSync(resolve(ROOT, "js/admin-app.js"), "utf8");

function inputTag() {
  const ini = src.indexOf('id="admin-email"');
  expect(ini).toBeGreaterThan(0);
  const iniTag = src.lastIndexOf("<input", ini);
  const finTag = src.indexOf("/>", ini) + 2;
  return src.slice(iniTag, finTag);
}

describe("login del panel admin", () => {
  it("el campo de usuario NO es type=email (bloquea el login por usuario)", () => {
    expect(inputTag()).not.toContain('type="email"');
  });

  it("conserva autocomplete y requerido", () => {
    const input = inputTag();
    expect(input).toContain('autocomplete="username"');
    expect(input).toContain("required");
  });
});

// =====================================================
// Tests v5.39.5 — mejoras de configuración y de release:
//  · #1 credenciales: el trío get/save/clear de la config Supabase en
//    localStorage y sus validaciones.
//  · #3 CACHE_VERSION automático: sw.js deriva el nombre de caché de la
//    versión de la app y se registra como módulo ES (nada de "vNN" a mano).
// =====================================================
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";

import {
  getStoredSupabaseConfig,
  saveStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  SUPABASE_CONFIG_STORAGE_KEY,
} from "../js/supabase.js";

const ROOT = resolve(__dirname, "..");

describe("config de Supabase en este equipo (v5.39.5)", () => {
  beforeEach(() => {
    clearStoredSupabaseConfig();
  });

  it("guarda y recupera la configuración", () => {
    expect(saveStoredSupabaseConfig("https://mi-proy.supabase.co", "sb_publishable_abc")).toBe(true);
    const cfg = getStoredSupabaseConfig();
    expect(cfg).toEqual({ url: "https://mi-proy.supabase.co", anonKey: "sb_publishable_abc" });
  });

  it("clear deja el equipo sin configuración", () => {
    saveStoredSupabaseConfig("https://mi-proy.supabase.co", "k");
    expect(clearStoredSupabaseConfig()).toBe(true);
    expect(getStoredSupabaseConfig()).toBeNull();
    expect(localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY)).toBeNull();
  });

  it("una config incompleta se lee como null (no rompe la app)", () => {
    localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify({ url: "https://x.supabase.co" }));
    expect(getStoredSupabaseConfig()).toBeNull();
    localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, "no-es-json");
    expect(getStoredSupabaseConfig()).toBeNull();
  });
});

describe("CACHE_VERSION derivado de la versión (v5.39.5)", () => {
  const sw = readFileSync(resolve(ROOT, "sw.js"), "utf8");
  const banner = readFileSync(resolve(ROOT, "js/update-banner.js"), "utf8");

  it("sw.js importa la versión única de la verdad y no tiene versión a mano", () => {
    expect(sw).toContain('import { APP_VERSION, APP_BUILD } from "./js/version.js"');
    expect(sw).toContain("`mannol-pos-${APP_VERSION}(${APP_BUILD})`");
    expect(sw).not.toMatch(/mannol-pos-supabase-v\d+/); // ya no hay contador manual
  });

  it("el registro del SW usa type: module (requisito de SW-E module)", () => {
    expect(banner).toContain('type: "module"');
  });
});

describe("credenciales fuera del repo (v5.39.5)", () => {
  it("js/supabase-config.js ya no está en el índice de git", () => {
    let out = "";
    try {
      out = execSync("git ls-files js/supabase-config.js", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {}
    expect(out).toBe("");
  });
});

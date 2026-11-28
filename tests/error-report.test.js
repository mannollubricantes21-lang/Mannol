// =====================================================
// Tests v5.39.2 — hallazgo 4: red global de errores
// js/error-report.js instala window.onerror/unhandledrejection y
// mantiene un anillo de los últimos errores (memoria + localStorage).
// =====================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupErrorReporting,
  recordError,
  getRecentErrors,
  clearErrorLog,
} from "../js/error-report.js";

describe("error-report", () => {
  beforeEach(() => {
    clearErrorLog();
  });

  afterEach(() => {
    clearErrorLog();
  });

  it("registra errores enviados directamente", () => {
    recordError(new Error("boom de prueba"), "runtime", "js/x.js", 10);
    const errs = getRecentErrors();
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe("boom de prueba");
    expect(errs[0].kind).toBe("runtime");
    expect(errs[0].source).toBe("js/x.js");
    expect(errs[0].line).toBe(10);
    expect(errs[0].at).toBeGreaterThan(0);
  });

  it("los mensajes se truncan y nunca lanzan", () => {
    const largo = "x".repeat(500);
    expect(() => recordError(largo)).not.toThrow();
    expect(getRecentErrors()[0].message.length).toBeLessThanOrEqual(200);
  });

  it("deduplica ráfagas del mismo error (bucle de render)", () => {
    recordError(new Error("mismo error"), "runtime");
    recordError(new Error("mismo error"), "runtime");
    const errs = getRecentErrors();
    expect(errs).toHaveLength(1);
    expect(errs[0].count).toBe(2);
  });

  it("persiste en localStorage y sobrevive a una recarga simulada", () => {
    recordError(new Error("persistente"), "promise");
    const raw = localStorage.getItem("mannol-error-log-v1");
    expect(raw).toBeTruthy();
    const arr = JSON.parse(raw);
    expect(arr.some((e) => e.message === "persistente")).toBe(true);
  });

  it("setupErrorReporting instala los manejadores y captura un error real", () => {
    expect(() => setupErrorReporting()).not.toThrow();
    // Segunda llamada: idempotente, no duplica
    expect(() => setupErrorReporting()).not.toThrow();
    // Un error de runtime de verdad (como los que lanza la app) llega al log
    const ev = new ErrorEvent("error", {
      message: "fallo capturado",
      filename: "js/app.js",
      lineno: 42,
      error: new Error("fallo capturado"),
    });
    window.dispatchEvent(ev);
    const errs = getRecentErrors();
    expect(errs.some((e) => e.message === "fallo capturado")).toBe(true);
  });

  it("clearErrorLog vacía memoria y localStorage", () => {
    recordError(new Error("a borrar"));
    clearErrorLog();
    expect(getRecentErrors()).toHaveLength(0);
    expect(localStorage.getItem("mannol-error-log-v1")).toBeNull();
  });
});

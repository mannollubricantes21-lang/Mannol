// =====================================================
// Tests v5.39.2 — hallazgo 6: la cuota llena de los espejos avisa
// Antes mirrorSave tragaba los errores con catch {} y el modo
// offline aparentaba funcionar con datos viejos.
// =====================================================
import { describe, it, expect, afterEach, vi } from "vitest";
import { mirrorSave, getMirrorStatus } from "../js/db.js";

describe("mirrorSave — cuota de localStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("guarda y recupera un espejo normal (sin cuota)", () => {
    expect(() => mirrorSave("test-ok", { a: 1 })).not.toThrow();
    const raw = localStorage.getItem("mannol-mirror-v1:test-ok");
    expect(JSON.parse(raw).data).toEqual({ a: 1 });
  });

  it("con la cuota llena: no lanza, registra y dispara el evento", () => {
    const evento = new Promise((resolve) => {
      window.addEventListener("mannol:mirror-quota", (e) => resolve(e.detail), { once: true });
    });
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      throw e;
    });
    expect(() => mirrorSave("test-quota", { a: 2 })).not.toThrow();
    const status = getMirrorStatus();
    expect(status.quotaFailedAt).toBeGreaterThan(0);
    // el evento llega con el nombre del espejo que falló
    return expect(evento).resolves.toEqual({ name: "test-quota" }).finally(() => {
      expect(spy).toHaveBeenCalled();
    });
  });

  it("getMirrorStatus refleja solo fallos reales (sin cuota no marca)", () => {
    // En un flujo limpio (setItem funcional), un guardado no marca el flag
    vi.spyOn(Storage.prototype, "setItem");
    const before = getMirrorStatus().quotaFailedAt;
    mirrorSave("test-ok-2", { b: 3 });
    expect(getMirrorStatus().quotaFailedAt).toBe(before);
  });
});

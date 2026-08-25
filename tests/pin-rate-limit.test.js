// =====================================================
// Tests: PIN rate limit
// =====================================================
import { describe, it, expect, beforeEach } from "vitest";
import { canAttemptPin, recordPinAttempt, clearPinAttempts, getPinBlockRemainingSec } from "../js/pin-rate-limit.js";

describe("pin-rate-limit", () => {
  const WAREHOUSE_ID = "wh-test-1";

  beforeEach(() => {
    localStorage.clear();
  });

  it("permite intentos cuando no hay historial", () => {
    expect(canAttemptPin(WAREHOUSE_ID)).toBe(true);
    expect(getPinBlockRemainingSec(WAREHOUSE_ID)).toBe(0);
  });

  it("permite hasta 4 intentos fallidos sin bloquear", () => {
    for (let i = 0; i < 4; i++) {
      recordPinAttempt(WAREHOUSE_ID);
      expect(canAttemptPin(WAREHOUSE_ID)).toBe(true);
    }
  });

  it("bloquea al 5to intento fallido", () => {
    for (let i = 0; i < 4; i++) recordPinAttempt(WAREHOUSE_ID);
    expect(canAttemptPin(WAREHOUSE_ID)).toBe(true);
    recordPinAttempt(WAREHOUSE_ID);
    expect(canAttemptPin(WAREHOUSE_ID)).toBe(false);
    expect(getPinBlockRemainingSec(WAREHOUSE_ID)).toBeGreaterThan(0);
  });

  it("devuelve segundos restantes positivos cuando está bloqueado", () => {
    for (let i = 0; i < 5; i++) recordPinAttempt(WAREHOUSE_ID);
    const remaining = getPinBlockRemainingSec(WAREHOUSE_ID);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(300); // 5 min = 300s
  });

  it("clearPinAttempts desbloquea", () => {
    for (let i = 0; i < 5; i++) recordPinAttempt(WAREHOUSE_ID);
    expect(canAttemptPin(WAREHOUSE_ID)).toBe(false);
    clearPinAttempts(WAREHOUSE_ID);
    expect(canAttemptPin(WAREHOUSE_ID)).toBe(true);
    expect(getPinBlockRemainingSec(WAREHOUSE_ID)).toBe(0);
  });

  it("aisla los intentos entre almacenes", () => {
    for (let i = 0; i < 5; i++) recordPinAttempt("wh-A");
    expect(canAttemptPin("wh-A")).toBe(false);
    expect(canAttemptPin("wh-B")).toBe(true);
  });

  it("no se rompe con warehouseId vacío o null", () => {
    expect(canAttemptPin("")).toBe(true);
    recordPinAttempt("");
    recordPinAttempt(null);
    expect(canAttemptPin("")).toBe(true);
  });
});

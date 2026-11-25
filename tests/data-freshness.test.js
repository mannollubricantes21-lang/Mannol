// =====================================================
// Tests: js/data-freshness.js — «datos de hace X» (v5.17)
// Cuando el service worker sirve la copia guardada (sin red o
// servidor lento), el banner muestra la antigüedad de los datos.
// =====================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordDataOk,
  getDataAgeMs,
  formatDataAge,
  clearDataFreshness,
} from "../js/data-freshness.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordDataOk / getDataAgeMs", () => {
  it("marca y devuelve la edad de los datos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00"));
    recordDataOk("stock:wh-1");
    expect(getDataAgeMs("stock:wh-1")).toBe(0);
    vi.advanceTimersByTime(12 * 60000);
    expect(getDataAgeMs("stock:wh-1")).toBe(12 * 60000);
  });

  it("actualiza la marca con cada carga nueva", () => {
    vi.useFakeTimers();
    recordDataOk("products");
    vi.advanceTimersByTime(60000);
    recordDataOk("products");
    expect(getDataAgeMs("products")).toBe(0);
  });

  it("devuelve null para datos nunca cargados o sin nombre", () => {
    expect(getDataAgeMs("stock:otro")).toBeNull();
    expect(getDataAgeMs("")).toBeNull();
    expect(getDataAgeMs(null)).toBeNull();
  });

  it("cada clave lleva su propia marca", () => {
    vi.useFakeTimers();
    recordDataOk("stock:a");
    vi.advanceTimersByTime(5000);
    recordDataOk("stock:b");
    expect(getDataAgeMs("stock:a")).toBe(5000);
    expect(getDataAgeMs("stock:b")).toBe(0);
  });
});

describe("formatDataAge", () => {
  it("formatea minutos, horas y días", () => {
    expect(formatDataAge(30000)).toBe("menos de 1 min");
    expect(formatDataAge(12 * 60000)).toBe("12 min");
    expect(formatDataAge(60 * 60000)).toBe("1 h 00 min");
    expect(formatDataAge(65 * 60000)).toBe("1 h 05 min");
    expect(formatDataAge(25 * 3600000)).toBe("1 d");
  });

  it("vacío para valores inválidos", () => {
    expect(formatDataAge(null)).toBe("");
    expect(formatDataAge(undefined)).toBe("");
    expect(formatDataAge(NaN)).toBe("");
  });
});

describe("clearDataFreshness", () => {
  it("borra todas las marcas", () => {
    recordDataOk("stock:a");
    recordDataOk("products");
    clearDataFreshness();
    expect(getDataAgeMs("stock:a")).toBeNull();
    expect(getDataAgeMs("products")).toBeNull();
  });
});

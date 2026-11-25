// =====================================================
// Tests v5.18.0 — atajos de cobro y estado del equipo
// billPresetsFor / normalizePaymentPreference (payment-utils)
// groupPendingByWarehouse (offline-queue)
// =====================================================
import { describe, it, expect } from "vitest";
import { billPresetsFor, normalizePaymentPreference, BILLS_BY_CURRENCY } from "../js/payment-utils.js";
import { groupPendingByWarehouse } from "../js/offline-queue.js";

const RATES = {
  MN: { rateUSD: 0.003125 }, // 1 USD = 320 MN
  EUR: { rateUSD: 1.08 },
};

describe("BILLS_BY_CURRENCY", () => {
  it("solo efectivo: la transferencia no tiene billetes", () => {
    expect(BILLS_BY_CURRENCY.TRANSFERENCIA).toEqual([]);
    expect(BILLS_BY_CURRENCY.USD.length).toBeGreaterThan(0);
    expect(BILLS_BY_CURRENCY.MN).toContain(1000);
  });
});

describe("billPresetsFor", () => {
  it("USD: billetes + «Exacto» con el total", () => {
    const presets = billPresetsFor("USD", 37.5, RATES);
    const labels = presets.map((p) => p.label);
    expect(labels).toEqual(["$5", "$10", "$20", "$50", "$100", "Exacto"]);
    const exact = presets[presets.length - 1];
    expect(exact.value).toBeCloseTo(37.5, 2);
  });

  it("MN: convierte el total con la tasa del día", () => {
    const presets = billPresetsFor("MN", 10, RATES);
    expect(presets.map((p) => p.label)).toContain("₱1000");
    const exact = presets.find((p) => p.label === "Exacto");
    expect(exact.value).toBeCloseTo(3200, 0); // 10 USD × 320
  });

  it("sin tasa para la moneda: sin «Exacto» (solo billetes si los hay)", () => {
    expect(billPresetsFor("MN", 10, {})).toEqual(BILLS_BY_CURRENCY.MN.map((b) => ({ label: `₱${b}`, value: b })));
    expect(billPresetsFor("TRANSFERENCIA", 10, {})).toEqual([]);
    expect(billPresetsFor("TRANSFERENCIA", 10, RATES)).toEqual([]); // nunca hay tasa de TRANSFERENCIA
  });
});

describe("normalizePaymentPreference", () => {
  it("acepta objeto y JSON guardado en localStorage", () => {
    expect(normalizePaymentPreference({ mode: "SINGLE", currency: "MN" })).toEqual({ mode: "SINGLE", currency: "MN" });
    expect(normalizePaymentPreference('{"mode":"SINGLE","currency":"EUR"}')).toEqual({ mode: "SINGLE", currency: "EUR" });
  });

  it("MULTI se recuerda sin moneda concreta", () => {
    expect(normalizePaymentPreference({ mode: "MULTI", currency: "USD" })).toEqual({ mode: "MULTI", currency: null });
    expect(normalizePaymentPreference('{"mode":"MULTI"}')).toEqual({ mode: "MULTI", currency: null });
  });

  it("rechaza datos inválidos sin lanzar", () => {
    expect(normalizePaymentPreference(null)).toBeNull();
    expect(normalizePaymentPreference("no-es-json")).toBeNull();
    expect(normalizePaymentPreference({ mode: "OTRO" })).toBeNull();
    expect(normalizePaymentPreference({ mode: "SINGLE", currency: "CUP" })).toBeNull(); // moneda desconocida
    expect(normalizePaymentPreference({ currency: "USD" })).toBeNull(); // sin modo
    expect(normalizePaymentPreference(42)).toBeNull();
  });
});

function pending(code, whId, whCode, extra = {}) {
  return {
    id: `id-${code}`,
    code,
    warehouseId: whId,
    warehouseCode: whCode,
    warehouseName: `Almacén ${whCode}`,
    createdAt: Date.now(),
    items: [{ quantity: 1 }],
    totalUSD: 10,
    blockedReason: extra.blockedReason || null,
    ...extra,
  };
}

describe("groupPendingByWarehouse", () => {
  const VIB = "uuid-vib";
  const LIS = "uuid-lis";

  it("agrupa por almacén y pone el actual primero", () => {
    const list = [
      pending("LIS-1", LIS, "LIS"),
      pending("VIB-1", VIB, "VIB"),
      pending("VIB-2", VIB, "VIB"),
    ];
    const groups = groupPendingByWarehouse(list, VIB);
    expect(groups).toHaveLength(2);
    expect(groups[0].warehouseId).toBe(VIB);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].warehouseCode).toBe("LIS");
  });

  it("cuenta las ventas para revisar de cada grupo", () => {
    const list = [
      pending("VIB-1", VIB, "VIB"),
      pending("VIB-2", VIB, "VIB", { blockedReason: "warehouse_invalid" }),
    ];
    const groups = groupPendingByWarehouse(list, VIB);
    expect(groups[0].blocked).toBe(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it("soporta listas vacías y ventas sin almacén", () => {
    expect(groupPendingByWarehouse([], "x")).toEqual([]);
    expect(groupPendingByWarehouse([pending("X-1", null, "?")], null)).toHaveLength(1);
    expect(groupPendingByWarehouse(null)).toEqual([]);
  });
});

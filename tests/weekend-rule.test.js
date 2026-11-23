// =====================================================
// Tests: regla de fin de semana (redirección de ventas)
// shouldRedirectWeekend + resolveEffectiveWarehouse (db.js, funciones puras)
// =====================================================
import { describe, it, expect } from "vitest";
import { shouldRedirectWeekend, resolveEffectiveWarehouse } from "../js/db.js";

const settingsOn = { weekendRedirectEnabled: true, weekendWarehouseId: "wh-vedado" };
const settingsOff = { weekendRedirectEnabled: false, weekendWarehouseId: "wh-vedado" };
const seller = { id: "wh-centro", name: "Centro", code: "CEN" };
const vedado = { id: "wh-vedado", name: "Vedado", code: "VED" };

// Fechas construidas en horario LOCAL para que getDay() sea estable
// en cualquier timezone del runner.
// Enero 2026: 10 = sábado, 11 = domingo, 12 = lunes, 9 = viernes.
const saturday = new Date(2026, 0, 10, 12).getTime();
const sunday = new Date(2026, 0, 11, 12).getTime();
const monday = new Date(2026, 0, 12, 12).getTime();
const friday = new Date(2026, 0, 9, 12).getTime();

describe("shouldRedirectWeekend", () => {
  it("no redirige si la regla está desactivada o incompleta", () => {
    expect(shouldRedirectWeekend(saturday, null)).toBeNull();
    expect(shouldRedirectWeekend(saturday, {})).toBeNull();
    expect(shouldRedirectWeekend(saturday, settingsOff)).toBeNull();
    expect(shouldRedirectWeekend(saturday, { weekendRedirectEnabled: true })).toBeNull();
  });

  it("redirige sábado y domingo cuando está activa", () => {
    expect(shouldRedirectWeekend(saturday, settingsOn)?.weekendWarehouseId).toBe("wh-vedado");
    expect(shouldRedirectWeekend(sunday, settingsOn)?.weekendWarehouseId).toBe("wh-vedado");
  });

  it("no redirige de lunes a viernes", () => {
    expect(shouldRedirectWeekend(monday, settingsOn)).toBeNull();
    expect(shouldRedirectWeekend(friday, settingsOn)).toBeNull();
  });
});

describe("resolveEffectiveWarehouse", () => {
  it("en fin de semana asigna la venta al almacén configurado y guarda auditoría", () => {
    const r = resolveEffectiveWarehouse(seller, [seller, vedado], settingsOn, saturday);
    expect(r.weekendRedirect).toBe(true);
    expect(r.effective.id).toBe("wh-vedado");
    expect(r.originalWarehouseId).toBe("wh-centro");
    expect(r.weekendWarehouseId).toBe("wh-vedado");
  });

  it("entre semana la venta queda en el almacén del vendedor", () => {
    const r = resolveEffectiveWarehouse(seller, [seller, vedado], settingsOn, monday);
    expect(r.weekendRedirect).toBe(false);
    expect(r.effective.id).toBe("wh-centro");
    expect(r.originalWarehouseId).toBeNull();
  });

  it("si el vendedor ya trabaja en el almacén de fin de semana no marca redirección", () => {
    const r = resolveEffectiveWarehouse(vedado, [seller, vedado], settingsOn, sunday);
    expect(r.weekendRedirect).toBe(false);
    expect(r.effective.id).toBe("wh-vedado");
    expect(r.originalWarehouseId).toBeNull();
  });

  it("si el almacén de fin de semana fue eliminado, hace fallback al del vendedor", () => {
    const r = resolveEffectiveWarehouse(seller, [seller], settingsOn, saturday);
    expect(r.weekendRedirect).toBe(false);
    expect(r.effective.id).toBe("wh-centro");
  });

  it("sin almacén del vendedor no rompe", () => {
    const r = resolveEffectiveWarehouse(null, [vedado], settingsOn, saturday);
    expect(r.weekendRedirect).toBe(false);
    expect(r.effective).toBeNull();
  });
});

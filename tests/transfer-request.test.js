// =====================================================
// Tests: solicitudes de traspaso (js/sales-stats.js, puro)
// validateTransferRequest + canTransitionRequest
// =====================================================
import { describe, it, expect } from "vitest";
import { validateTransferRequest, canTransitionRequest } from "../js/sales-stats.js";

const valid = {
  fromWarehouseId: "wh-lisa",
  toWarehouseId: "wh-vib",
  productId: "p-1",
  quantity: 10,
};

describe("validateTransferRequest", () => {
  it("acepta una solicitud válida", () => {
    expect(validateTransferRequest(valid)).toEqual({ ok: true });
  });

  it("rechaza campos faltantes", () => {
    for (const key of ["fromWarehouseId", "toWarehouseId", "productId"]) {
      const r = validateTransferRequest({ ...valid, [key]: undefined });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/obligatorios/);
    }
  });

  it("rechaza origen y destino iguales", () => {
    const r = validateTransferRequest({ ...valid, toWarehouseId: "wh-lisa" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mismo almacén/);
  });

  it("rechaza cantidades no enteras, cero, negativas o fuera de rango", () => {
    expect(validateTransferRequest({ ...valid, quantity: 0 }).ok).toBe(false);
    expect(validateTransferRequest({ ...valid, quantity: -5 }).ok).toBe(false);
    expect(validateTransferRequest({ ...valid, quantity: 2.5 }).ok).toBe(false);
    expect(validateTransferRequest({ ...valid, quantity: 1001 }).ok).toBe(false);
    expect(validateTransferRequest({ ...valid, quantity: 1000 }).ok).toBe(true);
    expect(validateTransferRequest({ ...valid, quantity: "10" }).ok).toBe(false); // string no numérico
  });
});

describe("canTransitionRequest (máquina de estados)", () => {
  it("PENDIENTE puede ir a APROBADA, RECHAZADA o CANCELADA", () => {
    expect(canTransitionRequest("PENDIENTE", "APROBADA")).toBe(true);
    expect(canTransitionRequest("PENDIENTE", "RECHAZADA")).toBe(true);
    expect(canTransitionRequest("PENDIENTE", "CANCELADA")).toBe(true);
  });

  it("PENDIENTE no se queda pendiente ni salta estados raros", () => {
    expect(canTransitionRequest("PENDIENTE", "PENDIENTE")).toBe(false);
    expect(canTransitionRequest("PENDIENTE", "COMPLETADA")).toBe(false);
  });

  it("los estados finales son cerrados", () => {
    for (const from of ["APROBADA", "RECHAZADA", "CANCELADA"]) {
      for (const to of ["PENDIENTE", "APROBADA", "RECHAZADA", "CANCELADA"]) {
        expect(canTransitionRequest(from, to)).toBe(false);
      }
    }
  });
});

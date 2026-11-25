// =====================================================
// Tests: guardar almacén (v5.14.0)
//  · el formulario del admin mandaba `_createdBy` → PGRST204 y NO se guardaba,
//    aunque la pantalla dijera «Almacén guardado» (comprobado contra PostgREST 12)
//  · sin la migración v5.14, se guarda el almacén y se avisa que faltan los vendedores
//  · un error real llega a la pantalla (antes devolvía "demo-id" en silencio)
//  · al editar no se reescribe created_at (el almacén no salta al final de la lista)
// =====================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = [];
let missingSellerColumns = false;
let failWith = null;
const COLS = new Set(["id", "name", "code", "address", "phone", "active", "pin", "seller_commission_percent",
  "seller_commission_currency", "created_at", "seller_weekend_split", "seller_name", "seller_weekend_name"]);

// Cliente falso con las reglas de PostgREST: columna desconocida → PGRST204
function fakeFrom(table) {
  const q = { table, op: null, row: null };
  const check = () => {
    if (failWith) return failWith;
    for (const k of Object.keys(q.row)) {
      const exists = COLS.has(k) && !(missingSellerColumns && k.startsWith("seller_") && k !== "seller_commission_percent" && k !== "seller_commission_currency");
      if (!exists) return { code: "PGRST204", message: `Could not find the '${k}' column of '${table}' in the schema cache` };
    }
    return null;
  };
  const api = {
    update(r) { q.op = "update"; q.row = r; return api; },
    insert(r) { q.op = "insert"; q.row = r; return api; },
    eq() { return api; },
    select() { return api; },
    single() { return api; },
    then(res, rej) {
      calls.push({ ...q });
      const error = check();
      return Promise.resolve(error ? { data: null, error } : { data: { id: "new-uuid" }, error: null }).then(res, rej);
    },
  };
  return api;
}
vi.mock("../js/supabase.js", async (orig) => ({
  ...(await orig()),
  getSupabase: async () => ({ from: fakeFrom }),
  isSupabaseConfiguredAsync: async () => true,
}));

import { saveWarehouse, sanitizeWarehouseRow, isMissingSellerColumnsError } from "../js/db.js";
import * as db from "../js/db.js";

const adminForm = { id: "w-1", name: "Víbora", code: "VIB", address: "Obispo #45", phone: null, pin: "2611", active: true,
  sellerCommissionPercent: 3, sellerCommissionCurrency: "USD", _createdBy: { id: "u-admin", displayName: "Administrador" } };

beforeEach(() => { calls.length = 0; missingSellerColumns = false; failWith = null; });

describe("guardar almacén", () => {
  it("descarta lo que no es columna (_createdBy) y guarda", async () => {
    await expect(saveWarehouse(adminForm)).resolves.toBe("w-1");
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].row)).not.toContain("_created_by");
    expect(calls[0].row).toMatchObject({ name: "Víbora", pin: "2611" });
  });

  it("al editar no reescribe created_at; al crear sí lo pone", async () => {
    await saveWarehouse(adminForm);
    expect(calls[0].row).not.toHaveProperty("created_at");
    const { id, ...nuevo } = adminForm;
    await expect(saveWarehouse(nuevo)).resolves.toBe("new-uuid");
    expect(calls[1].op).toBe("insert");
    expect(calls[1].row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("con la migración v5.14 guarda quién vende", async () => {
    await saveWarehouse({ ...adminForm, sellerWeekendSplit: true, sellerName: "Ana", sellerWeekendName: "Luis" });
    expect(calls).toHaveLength(1);
    expect(calls[0].row).toMatchObject({ seller_weekend_split: true, seller_name: "Ana", seller_weekend_name: "Luis" });
    expect(db.lastWarehouseSaveSkippedSellers).toBe(false);
  });

  it("sin la migración: reintenta sin los vendedores, guarda el resto y lo avisa", async () => {
    missingSellerColumns = true;
    await expect(saveWarehouse({ ...adminForm, sellerWeekendSplit: true, sellerName: "Ana" })).resolves.toBe("w-1");
    expect(calls).toHaveLength(2);
    expect(calls[1].row).not.toHaveProperty("seller_weekend_split");
    expect(calls[1].row).toMatchObject({ name: "Víbora", pin: "2611" });
    expect(db.lastWarehouseSaveSkippedSellers).toBe(true);
  });

  it("un error real sube a la pantalla (no más «guardado» falso)", async () => {
    failWith = { code: "23505", message: "duplicate key value violates unique constraint \"warehouses_code_key\"" };
    await expect(saveWarehouse(adminForm)).rejects.toMatchObject({ code: "23505" });
  });

  it("helpers", () => {
    expect(sanitizeWarehouseRow({ name: "A", _created_by: {}, has_pin: true, seller_name: "Ana" })).toEqual({ name: "A", seller_name: "Ana" });
    expect(isMissingSellerColumnsError({ code: "PGRST204", message: "Could not find the 'seller_name' column of 'warehouses' in the schema cache" })).toBe(true);
    expect(isMissingSellerColumnsError({ code: "42703", message: 'column "seller_weekend_split" of relation "warehouses" does not exist' })).toBe(true);
    expect(isMissingSellerColumnsError({ code: "PGRST204", message: "Could not find the 'foo' column" })).toBe(false);
    expect(isMissingSellerColumnsError({ code: "23505", message: "seller_name" })).toBe(false);
  });
});

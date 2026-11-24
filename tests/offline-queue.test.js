// =====================================================
// Tests: js/offline-queue.js — cola de ventas sin conexión (v5.13.0)
// Lo importante: NUNCA mezclar almacenes y NUNCA perder ni duplicar ventas.
// =====================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  QUEUE_KEY,
  readQueue,
  addToQueue,
  removeFromQueue,
  updateQueuedSale,
  importLegacyQueue,
  markUploaded,
  wasUploaded,
  subscribeQueue,
  stripInternal,
  pendingForWarehouse,
  summarizeQueue,
  pendingQuantities,
  applyPendingToStock,
  saleMatchesFilters,
  mergePendingSales,
} from "../js/offline-queue.js";

const VIB = "11111111-1111-4111-8111-111111111111";
const LIS = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function sale(id, wh, code, extra = {}) {
  return {
    id,
    clientRef: `ref-${id}`,
    code: `${code}-${id}`,
    warehouseId: wh,
    warehouseCode: code,
    warehouseName: code === "VIB" ? "Víbora" : "Lisa",
    status: "COMPLETADA",
    totalUSD: 10,
    createdAt: 1_700_000_000_000 + Number(String(id).replace(/\D/g, "") || 0),
    items: [{ productId: P1, quantity: 2 }],
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("cola: guardar, quitar, actualizar", () => {
  it("guarda la venta con su almacén y la marca de tiempo", () => {
    expect(addToQueue(sale("1", VIB, "VIB"))).toBe(true);
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].warehouseId).toBe(VIB);
    expect(typeof q[0]._queuedAt).toBe("number");
    // vive en su propia clave (no dentro del estado general)
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY))).toHaveLength(1);
  });

  it("no duplica: mismo id o mismo clientRef", () => {
    addToQueue(sale("1", VIB, "VIB"));
    expect(addToQueue(sale("1", VIB, "VIB"))).toBe(false);
    expect(addToQueue({ ...sale("2", VIB, "VIB"), clientRef: "ref-1" })).toBe(false);
    expect(readQueue()).toHaveLength(1);
  });

  it("no vuelve a encolar una venta que ya subió", () => {
    markUploaded("ref-9");
    expect(wasUploaded("ref-9")).toBe(true);
    expect(addToQueue(sale("9", VIB, "VIB"))).toBe(false);
    expect(readQueue()).toHaveLength(0);
  });

  it("sin límite de 500: no descarta las más viejas", () => {
    for (let i = 0; i < 520; i++) addToQueue(sale(String(i), i % 2 ? VIB : LIS, i % 2 ? "VIB" : "LIS"));
    const q = readQueue();
    expect(q).toHaveLength(520);
    expect(q[0].id).toBe("0");
  });

  it("quita y actualiza por id", () => {
    addToQueue(sale("1", VIB, "VIB"));
    addToQueue(sale("2", LIS, "LIS"));
    const upd = updateQueuedSale("2", { _syncAttempts: 3 });
    expect(upd._syncAttempts).toBe(3);
    expect(updateQueuedSale("nope", { a: 1 })).toBeNull();
    expect(removeFromQueue("1")).toBe(true);
    expect(removeFromQueue("1")).toBe(false);
    expect(readQueue().map((s) => s.id)).toEqual(["2"]);
  });

  it("lanza si el equipo no tiene espacio (la venta NO se da por guardada)", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === QUEUE_KEY) throw new DOMException("lleno", "QuotaExceededError");
      return orig.call(this, k, v);
    };
    try {
      expect(() => addToQueue(sale("1", VIB, "VIB"))).toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
    expect(readQueue()).toHaveLength(0);
  });

  it("avisa a los suscriptores cuando cambia", () => {
    const seen = [];
    const off = subscribeQueue((q) => seen.push(q.length));
    addToQueue(sale("1", VIB, "VIB"));
    removeFromQueue("1");
    off();
    addToQueue(sale("2", VIB, "VIB"));
    expect(seen).toEqual([1, 0]);
  });

  it("ignora basura en el almacenamiento", () => {
    localStorage.setItem(QUEUE_KEY, "{no es json");
    expect(readQueue()).toEqual([]);
    localStorage.setItem(QUEUE_KEY, JSON.stringify([null, 3, { sinId: true }, { id: "ok" }]));
    expect(readQueue()).toEqual([{ id: "ok" }]);
  });
});

describe("migración de la cola anterior", () => {
  it("importa las ventas viejas sin duplicar ni re-subir", () => {
    addToQueue(sale("1", VIB, "VIB"));
    markUploaded("ref-3");
    const n = importLegacyQueue([sale("1", VIB, "VIB"), sale("2", LIS, "LIS"), sale("3", VIB, "VIB"), null]);
    expect(n).toBe(1);
    const q = readQueue();
    expect(q.map((s) => s.id)).toEqual(["1", "2"]);
    expect(q[1]._migrated).toBe(true);
    expect(importLegacyQueue([])).toBe(0);
    expect(importLegacyQueue(undefined)).toBe(0);
  });
});

describe("almacenes separados", () => {
  const q = [
    sale("1", VIB, "VIB"),
    sale("2", VIB, "VIB", { _lastError: { code: "RED" } }),
    sale("3", LIS, "LIS"),
    sale("4", LIS, "LIS", { _blocked: "warehouse_invalid" }),
  ];

  it("pendingForWarehouse filtra por almacén", () => {
    expect(pendingForWarehouse(q, VIB).map((s) => s.id)).toEqual(["1", "2"]);
    expect(pendingForWarehouse(q, LIS).map((s) => s.id)).toEqual(["3", "4"]);
    expect(pendingForWarehouse(q, null)).toHaveLength(4);
  });

  it("summarizeQueue separa «mías» de las de otros almacenes", () => {
    const s = summarizeQueue(q, VIB);
    expect(s.total).toBe(4);
    expect(s.mine).toBe(2);
    expect(s.othersCount).toBe(2);
    expect(s.others.map((g) => g.warehouseCode)).toEqual(["LIS"]);
    expect(s.blocked).toBe(1);
    expect(s.failing).toBe(1);
    expect(s.groups.map((g) => [g.warehouseCode, g.count, g.totalUSD])).toEqual([
      ["LIS", 2, 20],
      ["VIB", 2, 20],
    ]);
    // sin almacén actual (pantalla de inicio): todas son "mías"
    expect(summarizeQueue(q, null).mine).toBe(4);
    expect(summarizeQueue([], VIB)).toMatchObject({ total: 0, mine: 0, othersCount: 0 });
  });

  it("pendingQuantities solo cuenta ventas COMPLETADAS del MISMO almacén", () => {
    const qq = [
      ...q,
      sale("5", VIB, "VIB", { items: [{ productId: P2, quantity: 5 }, { productId: P1, quantity: 1 }] }),
      sale("6", VIB, "VIB", { status: "PENDIENTE", items: [{ productId: P1, quantity: 100 }] }),
      sale("7", VIB, "VIB", { items: [{ product_id: P2, quantity: "2" }, { productId: "", quantity: 9 }] }),
    ];
    const vib = pendingQuantities(qq, VIB);
    expect(vib.get(P1)).toBe(2 + 2 + 1); // ventas 1, 2 y 5
    expect(vib.get(P2)).toBe(5 + 2);
    const lis = pendingQuantities(qq, LIS);
    expect(lis.get(P1)).toBe(2); // la 4 está "para revisar": no cuenta
    expect(pendingQuantities(qq, null).size).toBe(0);
  });

  it("applyPendingToStock descuenta solo de su almacén y nunca baja de 0", () => {
    const rows = [
      { warehouseId: VIB, productId: P1, quantity: 10 },
      { warehouseId: VIB, productId: P2, quantity: 1 },
      { warehouseId: LIS, productId: P1, quantity: 10 },
    ];
    const qq = [sale("1", VIB, "VIB"), sale("2", VIB, "VIB", { items: [{ productId: P2, quantity: 4 }] })];
    const out = applyPendingToStock(rows, qq, VIB);
    expect(out[0]).toMatchObject({ quantity: 8, pendingQty: 2 });
    expect(out[1]).toMatchObject({ quantity: 0, pendingQty: 4 });
    expect(out[2]).toBe(rows[2]); // la fila de LIS no se toca
    expect(applyPendingToStock(rows, [], VIB)).toBe(rows);
    expect(applyPendingToStock(rows, qq, null)).toBe(rows);
  });
});

describe("historial: ventas por subir", () => {
  it("saleMatchesFilters respeta almacén, estado y fechas", () => {
    const s = sale("1", VIB, "VIB");
    expect(saleMatchesFilters(s, {})).toBe(true);
    expect(saleMatchesFilters(s, { warehouseId: VIB })).toBe(true);
    expect(saleMatchesFilters(s, { warehouseId: LIS })).toBe(false);
    expect(saleMatchesFilters(s, { status: "CANCELADA" })).toBe(false);
    expect(saleMatchesFilters(s, { from: s.createdAt + 1 })).toBe(false);
    expect(saleMatchesFilters(s, { to: s.createdAt - 1 })).toBe(false);
  });

  it("mergePendingSales agrega las de la cola (marcadas) sin duplicar ni mezclar", () => {
    const cloud = [{ ...sale("1", VIB, "VIB"), id: "1" }];
    const q = [
      sale("1", VIB, "VIB", { _syncAttempts: 2 }), // ya está en la nube (mismo id)
      sale("2", VIB, "VIB"),
      sale("3", LIS, "LIS"), // otro almacén
      sale("4", VIB, "VIB", { _blocked: "products_invalid" }),
    ];
    const out = mergePendingSales(cloud, q, { warehouseId: VIB });
    expect(out.map((s) => s.id)).toEqual(["2", "1"]); // más reciente primero
    expect(out[0].pendingSync).toBe(true);
    expect(out[0]._syncAttempts).toBeUndefined();
    expect(out[1].pendingSync).toBeUndefined();
    expect(mergePendingSales(cloud, [], {})).toBe(cloud);
  });

  it("stripInternal quita los campos de la cola", () => {
    expect(stripInternal({ id: "1", _blocked: "x", _lastError: {}, code: "A" })).toEqual({ id: "1", code: "A" });
  });
});

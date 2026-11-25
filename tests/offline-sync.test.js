// =====================================================
// Tests: js/offline-sync.js — subida de la cola (v5.13.0)
// Con una "nube" simulada que recuerda cada clientRef (como la RPC
// register_sale): respuesta perdida, sin red, almacén borrado, dos
// almacenes a la vez… La cola nunca pierde, duplica ni mezcla ventas.
// =====================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Cliente falso: solo lo que usa la comprobación "¿ya subió?" (client_ref)
const fakeClient = () => ({
  client: {},
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
});

vi.mock("../js/supabase.js", () => ({
  getSupabase: vi.fn(async () => fakeClient()),
  isSupabaseConfiguredAsync: vi.fn(async () => true),
}));
vi.mock("../js/ui.js", () => ({ toast: vi.fn() }));
vi.mock("../js/db.js", () => ({
  saveSale: vi.fn(async () => {}),
  adjustStock: vi.fn(async () => {}),
  deductSaleStockAtomic: vi.fn(async () => ({ ok: true, shortages: [] })),
  registerSaleRemote: vi.fn(),
  recordCardMovementForSale: vi.fn(async () => {}),
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v)),
}));

import * as db from "../js/db.js";
import * as supa from "../js/supabase.js";
import {
  enqueueSale,
  syncOfflineQueue,
  getPendingCount,
  getPendingSales,
  getQueueSummary,
  discardBlockedSale,
  validateQueuedSale,
  isNetworkError,
  getBackoffDelay,
  serverBlockReason,
  getLastSyncError,
} from "../js/offline-sync.js";
import { readQueue, wasUploaded, addToQueue } from "../js/offline-queue.js";

const VIB = "11111111-1111-4111-8111-111111111111";
const LIS = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let n = 0;
function newSale(wh, code, qty = 2, extra = {}) {
  n++;
  return {
    id: `S-${1_700_000_000_000 + n}-abc${n}`,
    code: `${code}-TEST${String(n).padStart(4, "0")}`,
    warehouseId: wh,
    warehouseCode: code,
    warehouseName: code,
    status: "COMPLETADA",
    totalUSD: 10,
    createdAt: Date.now(),
    items: [{ productId: P1, quantity: qty }],
    ...extra,
  };
}

// ===== "Nube" simulada (idempotente por clientRef, como register_sale) =====
let cloud;
function cloudRegister(sale) {
  if (!/^[0-9a-f-]{36}$/i.test(String(sale.warehouseId))) {
    const e = new Error("MANNOL_WAREHOUSE_NOT_FOUND: la venta no tiene un almacén válido");
    e.code = "P0001";
    throw e;
  }
  if (cloud.removedWarehouses.has(sale.warehouseId)) {
    const e = new Error(`MANNOL_WAREHOUSE_NOT_FOUND: el almacén de la venta ${sale.id} ya no existe`);
    e.code = "P0001";
    throw e;
  }
  if (cloud.sales.has(sale.clientRef)) return { ok: true, duplicate: true, sale_id: sale.id, deducted: 0, shortages: [] };
  cloud.sales.set(sale.clientRef, { ...sale });
  for (const it of sale.items) {
    const k = `${sale.warehouseId}|${it.productId}`;
    cloud.stock.set(k, (cloud.stock.get(k) ?? 0) - it.quantity);
  }
  return { ok: true, duplicate: false, sale_id: sale.id, deducted: sale.items.length, shortages: [] };
}
const netError = () => new TypeError("Failed to fetch");

async function sync(opts = { silent: true, immediate: true }) {
  let done = false;
  let result;
  const p = syncOfflineQueue(opts).then((r) => { done = true; result = r; });
  for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(50);
  await p;
  vi.clearAllTimers(); // descarta reintentos programados (se prueban aparte)
  return result;
}

function setOnline(v) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => v });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setOnline(true);
  cloud = {
    sales: new Map(),
    stock: new Map([[`${VIB}|${P1}`, 10], [`${LIS}|${P1}`, 10]]),
    removedWarehouses: new Set(),
  };
  vi.mocked(db.registerSaleRemote).mockReset().mockImplementation(async (s) => cloudRegister(s));
  vi.mocked(db.saveSale).mockClear();
  vi.mocked(db.deductSaleStockAtomic).mockReset().mockResolvedValue({ ok: true, shortages: [] });
  vi.mocked(db.recordCardMovementForSale).mockClear();
  vi.mocked(supa.getSupabase).mockResolvedValue(fakeClient());
  vi.mocked(supa.isSupabaseConfiguredAsync).mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("sin conexión: la venta espera en el equipo", () => {
  it("queda en cola y no se intenta subir hasta que vuelve la red", async () => {
    setOnline(false);
    const s = enqueueSale(newSale(VIB, "VIB"));
    expect(s.clientRef).toMatch(/^[0-9a-f-]{36}$/);
    const r = await sync();
    expect(r).toMatchObject({ skipped: true, reason: "offline" });
    expect(db.registerSaleRemote).not.toHaveBeenCalled();
    expect(getPendingCount(VIB)).toBe(1);

    setOnline(true);
    const r2 = await sync();
    expect(r2).toMatchObject({ synced: 1, failed: 0 });
    expect(readQueue()).toHaveLength(0);
    expect(cloud.sales.size).toBe(1);
    expect(wasUploaded(s.clientRef)).toBe(true);
  });
});

describe("almacenes separados", () => {
  it("cada venta sube a SU almacén y descuenta SU stock", async () => {
    setOnline(false);
    enqueueSale(newSale(VIB, "VIB", 3));
    enqueueSale(newSale(LIS, "LIS", 4));
    enqueueSale(newSale(VIB, "VIB", 1));
    expect(getPendingCount(VIB)).toBe(2);
    expect(getPendingCount(LIS)).toBe(1);
    expect(getQueueSummary(VIB)).toMatchObject({ mine: 2, othersCount: 1 });

    setOnline(true);
    await sync();
    const sent = vi.mocked(db.registerSaleRemote).mock.calls.map(([s]) => [s.warehouseId, s.code.split("-")[0]]);
    expect(sent).toEqual([[VIB, "VIB"], [LIS, "LIS"], [VIB, "VIB"]]);
    expect(cloud.stock.get(`${VIB}|${P1}`)).toBe(10 - 3 - 1);
    expect(cloud.stock.get(`${LIS}|${P1}`)).toBe(10 - 4);
    expect([...cloud.sales.values()].every((s) => s.code.startsWith(s.warehouseCode + "-"))).toBe(true);
  });
});

describe("sin duplicados", () => {
  it("respuesta perdida: la nube la guardó, la app reintenta → una sola venta y un solo descuento", async () => {
    vi.mocked(db.registerSaleRemote).mockImplementationOnce(async (s) => {
      cloudRegister(s); // llegó y se guardó…
      throw netError(); // …pero la respuesta se perdió
    });
    const s = enqueueSale(newSale(VIB, "VIB", 2));
    const r1 = await sync();
    expect(r1).toMatchObject({ synced: 0, failed: 1 });
    expect(readQueue()).toHaveLength(1); // sigue en cola: no sabemos si subió
    expect(readQueue()[0]._syncAttempts).toBe(1);
    expect(getLastSyncError()).toMatchObject({ network: true });

    const r2 = await sync();
    expect(r2).toMatchObject({ synced: 0, skipped: 1, failed: 0 });
    expect(readQueue()).toHaveLength(0);
    expect(cloud.sales.size).toBe(1);
    expect(cloud.stock.get(`${VIB}|${P1}`)).toBe(8);
    expect(getLastSyncError()).toBeNull();
    // al reintentar se manda el MISMO clientRef
    const refs = vi.mocked(db.registerSaleRemote).mock.calls.map(([x]) => x.clientRef);
    expect(refs).toEqual([s.clientRef, s.clientRef]);
  });

  it("dos sincronizaciones a la vez (p. ej. evento online + temporizador) no suben dos veces", async () => {
    enqueueSale(newSale(VIB, "VIB"));
    const a = syncOfflineQueue({ silent: true, immediate: true });
    const b = syncOfflineQueue({ silent: true, immediate: true });
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(50);
    const [ra, rb] = await Promise.all([a, b]);
    vi.clearAllTimers();
    expect([ra, rb].filter((r) => r.reason === "already_syncing")).toHaveLength(1);
    expect(db.registerSaleRemote).toHaveBeenCalledTimes(1);
  });

  it("venta antigua sin clientRef: recibe uno, se guarda y los reintentos usan el mismo", async () => {
    const legacy = { ...newSale(VIB, "VIB") };
    delete legacy.clientRef;
    addToQueue(legacy); // así quedaban en la cola de versiones anteriores
    expect(readQueue()[0].clientRef).toBeUndefined();
    vi.mocked(db.registerSaleRemote).mockRejectedValueOnce(netError());
    await sync();
    const ref = readQueue()[0].clientRef;
    expect(ref).toMatch(/^[0-9a-f-]{36}$/);
    await sync();
    const refs = vi.mocked(db.registerSaleRemote).mock.calls.map(([x]) => x.clientRef);
    expect(refs).toEqual([ref, ref]);
    expect(readQueue()).toHaveLength(0);
  });

  it("encolar la misma venta dos veces (doble toque) no la duplica", async () => {
    const s = newSale(VIB, "VIB");
    enqueueSale(s);
    enqueueSale({ ...s });
    expect(readQueue()).toHaveLength(1);
  });
});

describe("fallos", () => {
  it("sin red a mitad: corta la vuelta, guarda el intento y conserva el orden", async () => {
    enqueueSale(newSale(VIB, "VIB"));
    enqueueSale(newSale(VIB, "VIB"));
    vi.mocked(db.registerSaleRemote).mockRejectedValueOnce(netError());
    const r = await sync();
    expect(r).toMatchObject({ synced: 0, failed: 1 });
    expect(db.registerSaleRemote).toHaveBeenCalledTimes(1); // no sigue con la 2ª
    const q = readQueue();
    expect(q).toHaveLength(2);
    expect(q[0]._lastError).toMatchObject({ network: true });
    await sync();
    expect(readQueue()).toHaveLength(0);
    expect(cloud.sales.size).toBe(2);
  });

  it("almacén borrado en la nube → «para revisar», sin reintentos; las demás siguen", async () => {
    cloud.removedWarehouses.add(LIS);
    const lis = enqueueSale(newSale(LIS, "LIS"));
    enqueueSale(newSale(VIB, "VIB"));
    const r = await sync();
    expect(r).toMatchObject({ synced: 1, blocked: 1, failed: 0 });
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: lis.id, _blocked: "warehouse_missing" });
    // no se vuelve a intentar
    vi.mocked(db.registerSaleRemote).mockClear();
    await sync();
    expect(db.registerSaleRemote).not.toHaveBeenCalled();
    // el usuario puede descartarla desde «Ver»
    expect(getPendingSales()[0].blockedReason).toBe("warehouse_missing");
    expect(discardBlockedSale(lis.id)).toBe(true);
    expect(readQueue()).toHaveLength(0);
  });

  it("venta hecha con almacén de prueba (demo-1) → nunca se sube", async () => {
    const s = enqueueSale(newSale("demo-1", "VIB"));
    const r = await sync();
    expect(r).toMatchObject({ blocked: 1 });
    expect(db.registerSaleRemote).not.toHaveBeenCalled();
    expect(readQueue()[0]._blocked).toBe("warehouse_invalid");
    // una venta normal NO se puede descartar
    const ok = enqueueSale(newSale(VIB, "VIB"));
    setOnline(false);
    expect(discardBlockedSale(ok.id)).toBe(false);
    expect(discardBlockedSale(s.id)).toBe(true);
  });

  it("nube configurada pero sin cliente (librería sin cargar) → NO se da por subida", async () => {
    vi.mocked(supa.getSupabase).mockResolvedValue(null);
    enqueueSale(newSale(VIB, "VIB"));
    const r = await sync();
    expect(r).toMatchObject({ synced: 0, failed: 1 });
    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0]._lastError).toMatchObject({ code: "SIN_CLIENTE", network: true });
  });
});

describe("base de datos sin la migración v5.13 (método anterior)", () => {
  it("guarda una vez y, si el stock falla por red, al reintentar NO vuelve a guardar", async () => {
    const missing = Object.assign(new Error("RPC_MISSING"), { code: "RPC_MISSING" });
    vi.mocked(db.registerSaleRemote).mockRejectedValue(missing);
    vi.mocked(db.deductSaleStockAtomic).mockRejectedValueOnce(netError());
    enqueueSale(newSale(VIB, "VIB"));

    await sync();
    expect(db.saveSale).toHaveBeenCalledTimes(1);
    expect(readQueue()[0]._savedAt).toBeTruthy(); // fase "guardada" recordada
    expect(readQueue()[0]._stockDone).toBeFalsy();

    await sync();
    expect(db.saveSale).toHaveBeenCalledTimes(1); // no se duplica
    expect(db.deductSaleStockAtomic).toHaveBeenCalledTimes(2);
    expect(readQueue()).toHaveLength(0);
  });
});

describe("ayudas", () => {
  it("validateQueuedSale", () => {
    expect(validateQueuedSale(newSale(VIB, "VIB"))).toBeNull();
    expect(validateQueuedSale(newSale("demo-2", "VIB"))).toBe("warehouse_invalid");
    expect(validateQueuedSale(newSale(VIB, "VIB", 1, { items: [] }))).toBe("items_empty");
    expect(validateQueuedSale(newSale(VIB, "VIB", 1, { items: [{ productId: "p-demo-1", quantity: 1 }] }))).toBe("products_invalid");
    expect(validateQueuedSale(newSale("demo-2", "VIB"), { configured: false })).toBeNull(); // modo demo
  });

  it("isNetworkError distingue red de datos", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ name: "AbortError", message: "aborted" })).toBe(true);
    expect(isNetworkError({ message: "x", status: 503 })).toBe(true);
    expect(isNetworkError({ message: "x", status: 0 })).toBe(true);
    expect(isNetworkError({ message: "Load failed" })).toBe(true);
    expect(isNetworkError({ code: "42501", message: "permission denied", status: 403 })).toBe(false);
    expect(isNetworkError({ code: "P0001", message: "MANNOL_WAREHOUSE_NOT_FOUND", status: 400 })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  it("serverBlockReason solo para errores definitivos", () => {
    expect(serverBlockReason({ message: "MANNOL_WAREHOUSE_NOT_FOUND: ..." })).toBe("warehouse_missing");
    expect(serverBlockReason({ message: "MANNOL_SALE_INVALID: falta id" })).toBe("sale_invalid");
    expect(serverBlockReason(new TypeError("Failed to fetch"))).toBeNull();
  });

  it("getBackoffDelay crece y se limita a 60 s", () => {
    const d1 = getBackoffDelay(1);
    const d3 = getBackoffDelay(3);
    expect(d1).toBeGreaterThanOrEqual(2000);
    expect(d1).toBeLessThan(3000);
    expect(d3).toBeGreaterThanOrEqual(8000);
    expect(getBackoffDelay(50)).toBeLessThanOrEqual(60000);
  });
});

// =====================================================
// Tests: lo que lleva ganado el vendedor (v5.14.0)
//  · monto fijo por producto (lo configurado al vender, dentro de cada ítem)
//  · mayorista: por caja (no por unidad)
//  · completadas cuentan; pendientes aparte; canceladas no
//  · mes actual / mes pasado; turnos lunes-viernes y fin de semana
//  · ventas leídas de la nube (ítems en snake_case → camelCase) dan lo mismo
// =====================================================
import { describe, it, expect } from "vitest";
import {
  itemVendorCommission, saleVendorCommission, computeSellerEarnings, monthRange,
  shiftKeyFor, renderSellerEarningsCard, productsWithoutVendorCommission, moneyPair,
} from "../js/seller-earnings.js";
import { camelToSnake, snakeToCamel } from "../js/supabase.js";
import { sanitizeSaleRow } from "../js/db.js";

// Fechas en hora LOCAL (igual que la app)
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 20, 15); // viernes 20 nov 2026, 15:00

const oil = (qty, extra = {}) => ({ productId: "p-oil", name: "Energy 5W-30", quantity: qty, unitPrice: 25, vendorCommission: 100, vendorCommissionCurrency: "MN", ...extra });
const filt = (qty) => ({ productId: "p-fil", name: "Filtro W712", quantity: qty, unitPrice: 5, vendorCommission: 0.5, vendorCommissionCurrency: "USD" });
const sale = (createdAt, items, extra = {}) => ({ id: `S-${createdAt}-${Math.random()}`, createdAt, status: "COMPLETADA", items, ...extra });

describe("comisión por ítem y por venta", () => {
  it("monto fijo por unidad, en su moneda; sin moneda → MN", () => {
    expect(itemVendorCommission(oil(3))).toMatchObject({ mn: 300, usd: 0, units: 3, configured: true });
    expect(itemVendorCommission(filt(4))).toMatchObject({ usd: 2, mn: 0, units: 4 });
    expect(itemVendorCommission({ quantity: 2, vendorCommission: 50 })).toMatchObject({ mn: 100, usd: 0 });
    const s = saleVendorCommission(sale(NOW, [oil(2), filt(2)]));
    expect(s).toMatchObject({ mn: 200, usd: 1, units: 4, configured: true });
  });

  it("producto sin comisión configurada cuenta 0 (y la venta queda marcada)", () => {
    expect(saleVendorCommission(sale(NOW, [{ quantity: 2, name: "X" }]))).toMatchObject({ usd: 0, mn: 0, units: 2, configured: false });
    expect(saleVendorCommission(sale(NOW, [oil(1, { vendorCommission: 0 })]))).toMatchObject({ mn: 0, configured: true });
  });

  it("mayorista: cajas × comisión por caja en USD (no se multiplica por las unidades)", () => {
    // 3 cajas de 12 pomos = 36 unidades; 1.20 USD por caja → 3.60 USD (no 43.20)
    const w = sale(NOW, [{ productId: "p-oil", name: "Energy 5W-30", quantity: 36, isWholesale: true, boxes: 3,
      vendorCommissionPerBox: 1.2, vendorCommission: 1.2, vendorCommissionCurrency: "USD" }],
    { saleType: "WHOLESALE", boxes: 3, vendorCommissionPerBox: 1.2 });
    expect(saleVendorCommission(w)).toMatchObject({ usd: 3.6, mn: 0, units: 36 });
  });

  it("ventas antiguas sin el dato en los ítems usan los totales guardados (ambos nombres)", () => {
    expect(saleVendorCommission(sale(NOW, [{ quantity: 1 }], { vendorCommissionMN: 80 }))).toMatchObject({ mn: 80 });
    expect(saleVendorCommission(sale(NOW, [{ quantity: 1 }], { vendorCommissionUsd: 2, vendorCommissionMn: 0 }))).toMatchObject({ usd: 2 });
    // Mayorista antigua: solo datos a nivel de venta
    expect(saleVendorCommission(sale(NOW, [{ quantity: 24 }], { saleType: "WHOLESALE", boxes: 2, vendorCommissionPerBox: 1 }))).toMatchObject({ usd: 2 });
  });

  it("una venta leída de la nube (ítems en snake_case) da la misma comisión", () => {
    const local = sale(NOW, [oil(2), filt(3)], { vendorCommissionMN: 200, vendorCommissionUSD: 1.5 });
    // Mismo camino que una venta real: toRow → filtro de columnas → nube → lectura
    const fromCloud = snakeToCamel(sanitizeSaleRow(camelToSnake(local)));
    // Los totales por venta se pierden en la nube (vendor_commission_m_n no existe) …
    expect(fromCloud.vendorCommissionMN).toBeUndefined();
    expect(fromCloud.vendorCommissionMn).toBeUndefined();
    // … pero los ítems conservan la comisión configurada al vender
    expect(saleVendorCommission(fromCloud)).toEqual(saleVendorCommission(local));
    expect(saleVendorCommission(fromCloud)).toMatchObject({ mn: 200, usd: 1.5 });
  });
});

describe("lo ganado en el mes", () => {
  const sales = [
    sale(at(2026, 11, 3), [oil(2)]),                                  // 200 MN
    sale(at(2026, 11, 20, 9), [oil(1), filt(2)]),                     // hoy: 100 MN + 1 USD
    sale(at(2026, 11, 20, 10), [oil(1)], { pendingSync: true }),      // hoy, aún por subir: 100 MN
    sale(at(2026, 11, 12), [oil(5)], { status: "CANCELADA" }),        // no cuenta
    sale(at(2026, 11, 14), [oil(1)], { status: "PENDIENTE" }),        // por confirmar
    sale(at(2026, 10, 31, 23, 59), [oil(9)]),                         // octubre
    sale(at(2026, 12, 1, 0, 0), [oil(9)]),                            // diciembre
  ];

  it("suma solo las completadas del mes; pendientes aparte; hoy y por subir", () => {
    const e = computeSellerEarnings(sales, { now: NOW });
    expect(e.split).toBe(false);
    expect(e.monthName).toBe("noviembre");
    const sh = e.shifts[0];
    expect(sh).toMatchObject({ key: "all", mn: 400, usd: 1, sales: 3, units: 6, queued: 1 });
    expect(sh.today).toEqual({ mn: 200, usd: 1, sales: 2 });
    expect(sh.pending).toEqual({ mn: 100, usd: 0, sales: 1 });
    expect(e.total).toEqual({ mn: 400, usd: 1, sales: 3, units: 6 });
  });

  it("mes pasado (offset -1) toma solo octubre", () => {
    const e = computeSellerEarnings(sales, { now: NOW, offset: -1 });
    expect(e.monthName).toBe("octubre");
    expect(e.total).toMatchObject({ mn: 900, sales: 1 });
    expect(e.isCurrent).toBe(false);
  });

  it("límites del mes en hora local (enero: mes anterior = diciembre del año pasado)", () => {
    const r = monthRange(at(2027, 1, 15), -1);
    expect(r).toMatchObject({ year: 2026, month: 12, monthName: "diciembre" });
    expect(r.from).toBe(at(2026, 12, 1, 0, 0));
    expect(r.to).toBe(at(2027, 1, 1, 0, 0));
  });

  it("detalle por producto, de mayor a menor comisión", () => {
    const e = computeSellerEarnings(sales, { now: NOW });
    const names = e.shifts[0].products.map((p) => `${p.name}:${p.units}:${p.mn}:${p.usd}`);
    expect(names).toEqual(["Energy 5W-30:4:400:0", "Filtro W712:2:0:1"]);
  });
});

describe("dos vendedores: lunes a viernes y fin de semana", () => {
  const wh = { id: "wh-1", sellerWeekendSplit: true, sellerName: "Ana", sellerWeekendName: "Luis" };
  const sales = [
    sale(at(2026, 11, 20, 23, 30), [oil(1)]),   // viernes 23:30 → Ana
    sale(at(2026, 11, 21, 0, 10), [oil(2)]),    // sábado 00:10 → Luis
    sale(at(2026, 11, 22, 18), [filt(4)]),      // domingo → Luis
    sale(at(2026, 11, 23, 8), [oil(3)]),        // lunes → Ana
  ];

  it("cada venta cuenta para quien trabaja ese día (hora local)", () => {
    expect(shiftKeyFor(at(2026, 11, 20, 23, 30), wh)).toBe("weekday");
    expect(shiftKeyFor(at(2026, 11, 21, 0, 10), wh)).toBe("weekend");
    expect(shiftKeyFor(at(2026, 11, 21, 0, 10), { sellerWeekendSplit: false })).toBe("all");
    const e = computeSellerEarnings(sales, { warehouse: wh, now: at(2026, 11, 28, 11) }); // sábado 28
    expect(e.split).toBe(true);
    const [lv, sd] = e.shifts;
    expect(lv).toMatchObject({ key: "weekday", label: "Lunes a viernes", name: "Ana", mn: 400, sales: 2 });
    expect(sd).toMatchObject({ key: "weekend", label: "Sábado y domingo", name: "Luis", mn: 200, usd: 2, sales: 2 });
    expect(e.todayKey).toBe("weekend");
    expect(e.total).toMatchObject({ mn: 600, usd: 2, sales: 4 });
  });

  it("con una sola persona, el nombre (si lo hay) es el principal", () => {
    const e = computeSellerEarnings(sales, { warehouse: { sellerName: "Marta" }, now: NOW });
    expect(e.shifts).toHaveLength(1);
    expect(e.shifts[0].name).toBe("Marta");
  });
});

describe("tarjeta «Lo que llevas ganado»", () => {
  const mount = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d; };

  it("una persona: importe del mes, hoy, mes pasado y detalle", () => {
    const sales = [sale(at(2026, 11, 20, 9), [oil(2)]), sale(at(2026, 10, 10), [oil(3)])];
    const cur = computeSellerEarnings(sales, { now: NOW });
    const prev = computeSellerEarnings(sales, { now: NOW, offset: -1 });
    const el = mount(renderSellerEarningsCard(cur, prev));
    expect(el.querySelector(".card-title").textContent).toContain("Lo que llevas ganado");
    expect(el.querySelector(".earn-month").textContent).toBe("noviembre");
    expect(el.querySelector(".earn-amount").textContent).toBe("₱200.00");
    expect(el.textContent).toContain("Hoy: ₱200.00 · 1 venta");
    expect(el.querySelector(".earn-prev").textContent).toContain("Mes pasado (octubre): ₱300.00");
    expect(el.querySelectorAll(".earn-det-list li")).toHaveLength(1);
    expect(el.querySelector(".earn-today-pill")).toBeNull();
  });

  it("dos personas: dos importes con sus nombres y «Hoy» en el turno de hoy", () => {
    const wh = { sellerWeekendSplit: true, sellerName: "Ana", sellerWeekendName: "Luis" };
    const cur = computeSellerEarnings([sale(at(2026, 11, 21, 10), [oil(1)])], { warehouse: wh, now: at(2026, 11, 21, 15) });
    const el = mount(renderSellerEarningsCard(cur, null, { prevLoading: true }));
    const blocks = el.querySelectorAll(".earn-shift");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].textContent).toContain("Lunes a viernes");
    expect(blocks[0].textContent).toContain("Ana");
    expect(blocks[1].textContent).toContain("Luis");
    expect(blocks[1].classList.contains("is-today")).toBe(true);
    expect(blocks[1].querySelector(".earn-today-pill")).toBeTruthy();
    expect(blocks[1].querySelector(".earn-amount").textContent).toBe("₱100.00");
    expect(el.textContent).toContain("Cada venta cuenta para quien trabaja ese día");
    expect(el.textContent).toContain("cargando…");
  });

  it("avisa si los productos vendidos no tienen comisión configurada", () => {
    const cur = computeSellerEarnings([sale(at(2026, 11, 20, 9), [{ quantity: 2, name: "X" }])], { now: NOW });
    const el = mount(renderSellerEarningsCard(cur, null));
    expect(el.querySelector(".earn-hint")).toBeTruthy();
    expect(el.querySelector(".earn-amount").textContent).toBe("₱0.00");
  });

  it("los nombres se escapan (sin HTML inyectado)", () => {
    const wh = { sellerWeekendSplit: true, sellerName: "<img src=x onerror=alert(1)>", sellerWeekendName: "Luis" };
    const cur = computeSellerEarnings([], { warehouse: wh, now: NOW });
    const el = mount(renderSellerEarningsCard(cur, null));
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("ventas hechas sin conexión: cuentan y se avisa que están por subir; pendientes aparte", () => {
    const cur = computeSellerEarnings([
      sale(at(2026, 11, 20, 9), [oil(1)], { pendingSync: true }),
      sale(at(2026, 11, 19, 9), [oil(2)], { status: "PENDIENTE" }),
    ], { now: NOW });
    const el = mount(renderSellerEarningsCard(cur, null));
    expect(el.querySelector(".earn-amount").textContent).toBe("₱100.00");
    expect(el.querySelector(".earn-queued").textContent).toContain("Incluye 1 venta por subir");
    expect(el.querySelector(".earn-pending").textContent).toContain("+ ₱200.00 por confirmar (1 venta)");
  });

  it("una venta pendiente sin comisión no muestra «+ ₱0.00 por confirmar»", () => {
    const cur = computeSellerEarnings([sale(at(2026, 11, 19, 9), [{ quantity: 2, name: "X", vendorCommission: 0 }], { status: "PENDIENTE" })], { now: NOW });
    const el = mount(renderSellerEarningsCard(cur, null));
    expect(el.querySelector(".earn-pending")).toBeNull();
  });

  it("formato de importes: MN por defecto, USD aparte", () => {
    expect(moneyPair(0, 0)).toBe("₱0.00");
    expect(moneyPair(3, 0)).toBe("$3.00");
    expect(moneyPair(3, 1250)).toBe("₱1,250.00 + $3.00");
  });
});

describe("aviso al admin", () => {
  it("lista los productos activos sin comisión de vendedor", () => {
    const list = productsWithoutVendorCommission([
      { id: "a", active: true, vendorCommission: 100 },
      { id: "b", active: true, vendorCommission: 0 },
      { id: "c", active: true },
      { id: "d", active: false, vendorCommission: 0 },
    ]);
    expect(list.map((p) => p.id)).toEqual(["b", "c"]);
  });
});

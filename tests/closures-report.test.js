// =====================================================
// Tests: reportes de cierres (js/sales-stats.js, puro)
// reportPeriodRange + aggregateClosuresReport + dateKeyToMs
// =====================================================
import { describe, it, expect } from "vitest";
import { reportPeriodRange, aggregateClosuresReport, dateKeyToMs } from "../js/sales-stats.js";

// 2026-06-15 (lunes) 10:00 local
const T = new Date(2026, 5, 15, 10, 0, 0).getTime();
const DAY = 86400000;

function closure(dateKey, { wh = "wh-a", name = "Almacén A", sales = 2, units = 5, usd = 100, products = [] } = {}) {
  return {
    warehouseId: wh,
    warehouseName: name,
    warehouseCode: wh.toUpperCase().slice(0, 3),
    closureDate: dateKey,
    salesCount: sales,
    unitsSold: units,
    totalUSD: usd,
    topProducts: products,
  };
}

describe("dateKeyToMs", () => {
  it("convierte YYYY-MM-DD a medianoche local", () => {
    const ms = dateKeyToMs("2026-06-15");
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });
});

describe("reportPeriodRange", () => {
  it("la semana arranca el lunes 00:00 local", () => {
    // 2026-11-23 ES lunes → el rango arranca ese mismo día a las 00:00
    const monday = new Date(2026, 10, 23, 15, 30).getTime();
    const r = reportPeriodRange("week", monday);
    const from = new Date(r.fromMs);
    expect(from.getDay()).toBe(1);
    expect(from.getHours()).toBe(0);
    expect(r.label).toBe("Esta semana");
  });

  it("viernes → rango arranca el lunes de esa semana", () => {
    const friday = new Date(2026, 10, 20, 12, 0).getTime(); // viernes
    const r = reportPeriodRange("week", friday);
    const from = new Date(r.fromMs);
    expect(from.getDay()).toBe(1);
    expect(from.getDate()).toBe(16); // lunes 2026-11-16
  });

  it("el mes arranca el día 1 y los 30 días son exactos", () => {
    const month = reportPeriodRange("month", T);
    expect(new Date(month.fromMs).getDate()).toBe(1);
    expect(month.label).toBe("Este mes");

    const d30 = reportPeriodRange("30d", T);
    expect(T - d30.fromMs).toBe(30 * DAY);
    expect(d30.label).toBe("Últimos 30 días");
  });
});

describe("aggregateClosuresReport", () => {
  it("filtra por rango sobre closureDate", () => {
    const closures = [
      closure("2026-06-15"),
      closure("2026-06-14"),
      closure("2026-05-30"), // fuera del mes
    ];
    const r = aggregateClosuresReport(closures, reportPeriodRange("month", T));
    expect(r.totals.closures).toBe(2);
    expect(r.totals.totalUSD).toBe(200);
  });

  it("agrega por almacén y ordena por totalUSD descendente", () => {
    const closures = [
      closure("2026-06-15", { wh: "wh-a", name: "A", usd: 300 }),
      closure("2026-06-15", { wh: "wh-b", name: "B", usd: 500 }),
      closure("2026-06-14", { wh: "wh-a", name: "A", usd: 150 }),
      closure("2026-06-14", { wh: "wh-b", name: "B", usd: 100 }),
    ];
    const r = aggregateClosuresReport(closures, {});
    expect(r.perWarehouse.length).toBe(2);
    expect(r.perWarehouse[0].name).toBe("B");
    expect(r.perWarehouse[0].totalUSD).toBe(600);
    expect(r.perWarehouse[1].name).toBe("A");
    expect(r.perWarehouse[1].totalUSD).toBe(450);
    // días distintos con cierre: 2
    expect(r.days).toBe(2);
    expect(r.perWarehouse[1].avgDailyUSD).toBe(225);
  });

  it("agrega topProducts entre cierres y recorta a 8", () => {
    const closures = [
      closure("2026-06-15", { products: [{ name: "5W-30", qty: 4, total: 100 }, { name: "DOT 4", qty: 2, total: 20 }] }),
      closure("2026-06-14", { products: [{ name: "5W-30", qty: 3, total: 75 }, { name: "Filtro", qty: 1, total: 5 }] }),
    ];
    const r = aggregateClosuresReport(closures, {});
    expect(r.topProducts[0].name).toBe("5W-30");
    expect(r.topProducts[0].qty).toBe(7);
    expect(r.topProducts.length).toBe(3);
  });

  it("con lista vacía devuelve reporte en ceros y days≥1", () => {
    const r = aggregateClosuresReport([], {});
    expect(r.totals.closures).toBe(0);
    expect(r.perWarehouse).toEqual([]);
    expect(r.days).toBe(1);
    expect(r.topProducts).toEqual([]);
  });
});

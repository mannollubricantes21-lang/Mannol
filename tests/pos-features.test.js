// =====================================================
// Tests v5.10.0: más vendidos, cierre por WhatsApp, códigos de barras,
// conversor de monedas y tablas-tarjeta (etiquetas por columna)
// =====================================================
import { describe, it, expect } from "vitest";
import { computeTopSellers, buildClosureShareText, normalizeCode, findProductByCode, computeClosureStats } from "../js/sales-stats.js";
import { convertAmount, parseAmountInput, formatMoneyGrouped, formatMoney, formatWhen } from "../js/currency.js";
import { labelTableCards } from "../js/ui.js";

const DAY = 86400000;
const now = new Date(2026, 10, 23, 12, 0, 0).getTime();
const sale = (createdAt, items, extra = {}) => ({ status: "COMPLETADA", createdAt, items, totalAmount: 10, currency: "USD", ...extra });

describe("computeTopSellers", () => {
  const sales = [
    sale(now - 1 * DAY, [{ productId: "a", name: "Aceite A", quantity: 2 }, { productId: "b", name: "Filtro B", quantity: 1 }]),
    sale(now - 2 * DAY, [{ productId: "b", name: "Filtro B", quantity: 4 }]),
    sale(now - 3 * DAY, [{ productId: "c", name: "Grasa C", quantity: 3 }]),
    sale(now - 40 * DAY, [{ productId: "c", name: "Grasa C", quantity: 50 }]),          // fuera del período
    sale(now - 1 * DAY, [{ productId: "a", name: "Aceite A", quantity: 9 }], { status: "CANCELADA" }), // no cuenta
  ];

  it("ordena por unidades vendidas y respeta el período", () => {
    const top = computeTopSellers(sales, { sinceMs: now - 30 * DAY });
    expect(top.map((t) => t.productId)).toEqual(["b", "c", "a"]);
    expect(top[0]).toEqual({ productId: "b", name: "Filtro B", qty: 5 });
  });

  it("ignora ventas canceladas y respeta el límite", () => {
    const top = computeTopSellers(sales, { sinceMs: now - 30 * DAY, limit: 1 });
    expect(top).toHaveLength(1);
    expect(top[0].productId).toBe("b");
  });

  it("sin datos devuelve lista vacía", () => {
    expect(computeTopSellers(null)).toEqual([]);
    expect(computeTopSellers([{ status: "COMPLETADA", items: [{ name: "sin id", quantity: 3 }] }])).toEqual([]);
  });
});

describe("buildClosureShareText", () => {
  const stats = computeClosureStats([
    sale(now, [{ productId: "a", name: "Energy 5W-30", quantity: 2, subtotal: 50 }], { totalAmount: 50, currency: "USD" }),
    sale(now, [{ productId: "b", name: "Filtro W712", quantity: 1, subtotal: 5 }], { totalAmount: 5, currency: "MN" }),
  ], { fromMs: now - DAY, toMs: now + DAY });

  it("incluye almacén, totales, monedas y más vendidos con formato WhatsApp", () => {
    const txt = buildClosureShareText({ warehouseName: "Víbora", warehouseCode: "VIB", dateMs: now, stats, closedBy: "Ana", fmt: formatMoney });
    expect(txt).toContain("*MANNOL · Cierre de caja*");
    expect(txt).toContain("Víbora (VIB)");
    expect(txt).toContain("Ventas: *2* · Unidades: *3*");
    expect(txt).toContain("Total: *$55.00*");
    expect(txt).toContain("• USD: $50.00 (1 venta)");
    expect(txt).toContain("• MN: ₱5.00 (1 venta)");
    expect(txt).toContain("1. Energy 5W-30 — 2 u");
    expect(txt).toContain("Caja cerrada por Ana");
  });

  it("avisa si la caja aún no se cerró o no hubo ventas", () => {
    expect(buildClosureShareText({ warehouseName: "Lisa", dateMs: now, stats })).toContain("Caja pendiente de cerrar");
    const empty = computeClosureStats([], { fromMs: 0, toMs: 1 });
    const txt = buildClosureShareText({ warehouseName: "Lisa", dateMs: now, stats: empty });
    expect(txt).toContain("Sin ventas hoy");
    expect(txt).not.toContain("*Por moneda*");
  });
});

describe("códigos de barras", () => {
  const products = [
    { id: "p1", name: "Energy 5W-30", sku: "4036021101125" },
    { id: "p2", name: "Filtro", sku: "MN-W71293" },
    { id: "p3", name: "UPC", sku: "036000291452" },
    { id: "p4", name: "Sin SKU" },
  ];

  it("normaliza espacios, guiones y mayúsculas", () => {
    expect(normalizeCode(" mn-w712 93 ")).toBe("MNW71293");
    expect(normalizeCode(null)).toBe("");
  });

  it("encuentra por EAN-13, por SKU con guiones y tolera UPC-A ↔ EAN-13", () => {
    expect(findProductByCode(products, "4036021101125")?.id).toBe("p1");
    expect(findProductByCode(products, "mnw71293")?.id).toBe("p2");
    expect(findProductByCode(products, "0036000291452")?.id).toBe("p3"); // EAN-13 con 0 inicial
    expect(findProductByCode([{ id: "x", sku: "0036000291452" }], "036000291452")?.id).toBe("x");
  });

  it("devuelve null si no hay coincidencia", () => {
    expect(findProductByCode(products, "123")).toBeNull();
    expect(findProductByCode(products, "")).toBeNull();
  });
});

describe("conversor de monedas", () => {
  const rates = { usdInMN: 320, eurInMN: 346 };

  it("convierte entre USD, EUR y MN con las tasas del día", () => {
    expect(convertAmount(100, "USD", "MN", rates)).toBe(32000);
    expect(convertAmount(32000, "MN", "USD", rates)).toBe(100);
    expect(convertAmount(346, "MN", "EUR", rates)).toBe(1);
    expect(convertAmount(10, "EUR", "USD", rates)).toBeCloseTo(10.8125, 4);
    expect(convertAmount(5, "USD", "USD", rates)).toBe(5);
  });

  it("devuelve 0 con datos inválidos", () => {
    expect(convertAmount("abc", "USD", "MN", rates)).toBe(0);
    expect(convertAmount(10, "USD", "MN", { usdInMN: 0, eurInMN: 346 })).toBe(0);
  });

  it("lee montos escritos a mano", () => {
    expect(parseAmountInput("1234,5")).toBe(1234.5);
    expect(parseAmountInput("1.234,50")).toBe(1234.5);
    expect(parseAmountInput("1,234.50")).toBe(1234.5);
    expect(parseAmountInput(" 20 ")).toBe(20);
    expect(parseAmountInput("")).toBe(0);
    expect(parseAmountInput("-5")).toBe(0);
  });

  it("formatea con separador de miles", () => {
    expect(formatMoneyGrouped(32000, "MN")).toBe("₱32,000.00");
    expect(formatMoneyGrouped(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoneyGrouped(92.486, "EUR")).toBe("€92.49");
  });
});

describe("labelTableCards (tablas como tarjetas en móvil)", () => {
  it("pone la etiqueta de cada columna y marca imagen, título y acciones", () => {
    document.body.innerHTML = `
      <div class="overflow-x-auto"><table class="table table-cards">
        <thead><tr><th></th><th>Producto</th><th>Precio</th><th>Acciones</th></tr></thead>
        <tbody>
          <tr><td><img alt=""></td><td>Energy</td><td>$25.00</td><td><button>Editar</button></td></tr>
          <tr><td colspan="4">Sin productos</td></tr>
        </tbody>
      </table></div>`;
    labelTableCards(document);
    const tds = document.querySelectorAll("tbody tr:first-child td");
    expect(tds[0].classList.contains("tc-media")).toBe(true);
    expect(tds[1].classList.contains("tc-title")).toBe(true);
    expect(tds[2].dataset.label).toBe("Precio");
    expect(tds[3].classList.contains("tc-actions")).toBe(true);
    expect(document.querySelector("tbody tr:first-child").classList.contains("tc-has-media")).toBe(true);
    expect(document.querySelector("td[colspan]").classList.contains("tc-full")).toBe(true);
    expect(document.querySelector(".overflow-x-auto").classList.contains("tc-wrap")).toBe(true);
  });

  it("v5.11.0: reparte los datos en la cuadrícula según su largo (corto / medio / ancho)", () => {
    document.body.innerHTML = `
      <table class="table table-cards">
        <thead><tr><th>Producto</th><th>Cantidad</th><th>Categoría</th><th>Dirección</th><th>Acciones</th></tr></thead>
        <tbody><tr><td>Energy 5W-30</td><td>17</td><td>Minerales</td><td>Calle 70 #1108 e/ 11 y 13, Miramar, Playa</td><td><button>Editar</button></td></tr></tbody>
      </table>`;
    labelTableCards(document);
    const tds = document.querySelectorAll("tbody td");
    expect(tds[0].classList.contains("tc-title")).toBe(true);
    expect(tds[1].classList.contains("tc-short")).toBe(true);   // "17" + etiqueta corta
    expect(tds[2].classList.contains("tc-half")).toBe(true);    // "CATEGORÍA" (9 letras) no entra en 1 columna
    expect(tds[3].classList.contains("tc-wide")).toBe(true);    // dirección larga → todo el ancho
    expect(tds[4].classList.contains("tc-actions")).toBe(true);
    expect([...tds[4].classList].some((c) => /^tc-(short|half|wide)$/.test(c))).toBe(false);
  });

  it("no toca tablas sin la clase table-cards", () => {
    document.body.innerHTML = `<table class="table"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>`;
    labelTableCards(document);
    expect(document.querySelector("td").dataset.label).toBeUndefined();
  });
});

describe("formatWhen (fecha corta de las listas del móvil)", () => {
  const now = new Date(2026, 10, 23, 15, 0).getTime();          // 23 nov 2026, 15:00 (hora local)
  it("hoy y ayer", () => {
    expect(formatWhen(new Date(2026, 10, 23, 9, 5).getTime(), now)).toMatch(/^Hoy, 0?9:05$/);
    expect(formatWhen(new Date(2026, 10, 22, 23, 59).getTime(), now)).toMatch(/^Ayer, 23:59$/);
  });
  it("mismo año sin el año; otro año con el año y sin hora", () => {
    expect(formatWhen(new Date(2026, 10, 2, 13, 36).getTime(), now)).toMatch(/^2 nov\.?, 13:36$/);
    expect(formatWhen(new Date(2025, 11, 31, 10, 0).getTime(), now)).toMatch(/^31 dic\.? 2025$/);
  });
  it("sin fecha", () => {
    expect(formatWhen(null, now)).toBe("—");
  });
});

import { describe, it, expect } from "vitest";
import { suggestRestock, buildRestockText } from "../js/sales-stats.js";

const now = Date.UTC(2026, 10, 25);
const day = 86400000;
const products = [
  { id: "a", name: "Aceite A", minStock: 5 },
  { id: "b", name: "Aceite B", minStock: 5 },
  { id: "c", name: "Filtro C", minStock: 2 },
  { id: "d", name: "Sin movimiento", minStock: 5 },
];
const stock = [
  { productId: "a", quantity: 0 },
  { productId: "b", quantity: 8 },
  { productId: "c", quantity: 20 },
];
// A: 30 u en 30 días (1/día) · B: 60 u (2/día → 8 u = 4 días) · C: 3 u
const sales = [
  { status: "COMPLETADA", createdAt: now - 2 * day, items: [{ productId: "a", quantity: 30 }, { productId: "b", quantity: 60 }, { productId: "c", quantity: 3 }] },
  { status: "CANCELADA", createdAt: now - day, items: [{ productId: "c", quantity: 100 }] },
  { status: "COMPLETADA", createdAt: now - 40 * day, items: [{ productId: "c", quantity: 500 }] },
];

describe("v5.21.0 · pedido sugerido", () => {
  it("prioriza agotados y lo que se acaba pronto", () => {
    const r = suggestRestock({ products, stock, sales, nowMs: now });
    expect(r.map((x) => x.productId)).toEqual(["a", "b"]);
    // A: 1/día × 14 + 5 = 19 − 0
    expect(r[0]).toMatchObject({ suggested: 19, reason: "agotado" });
    // B: 2/día × 14 + 5 = 33 − 8 = 25
    expect(r[1]).toMatchObject({ suggested: 25, reason: "se acaba en ~4 días" });
  });
  it("arma el texto para WhatsApp", () => {
    const t = buildRestockText({ warehouseName: "Víbora", items: suggestRestock({ products, stock, sales, nowMs: now }) });
    expect(t).toContain("Aceite A: *19* u");
    expect(t).toContain("Total: 44 unidades");
  });
});

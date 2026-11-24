// =====================================================
// Tests: vista Historial (v5.13.0)
//  · con más de 50 ventas la paginación ya no rompe la vista
//    (antes: ReferenceError "pageStart is not defined")
//  · las ventas aún en cola salen con «Por subir» y sin acciones de estado
// =====================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

let SALES = [];
vi.mock("../js/db.js", () => ({
  subscribeSales: vi.fn((cb) => {
    cb(SALES);
    return () => {};
  }),
  updateSaleStatus: vi.fn(async () => {}),
}));
vi.mock("../js/push-notify.js", () => ({ notifySaleCompleted: vi.fn() }));

import { mountSalesHistoryView } from "../js/views/sales-history.js";
import { getStore } from "../js/store.js";

const VIB = "11111111-1111-4111-8111-111111111111";

function mkSale(i, extra = {}) {
  return {
    id: `S-${i}`,
    code: `VIB-TEST${String(i).padStart(4, "0")}`,
    clientRef: `ref-${i}`,
    warehouseId: VIB,
    warehouseCode: "VIB",
    warehouseName: "Víbora",
    userId: "u-1",
    userName: "Ana",
    status: "COMPLETADA",
    currency: "USD",
    paymentMode: "SINGLE",
    payments: [],
    items: [{ productId: "p1", productName: "Aceite", quantity: 1, unitPrice: 10 }],
    totalAmount: 10,
    totalUSD: 10,
    createdAt: Date.now() - i * 60000,
    ...extra,
  };
}

function mount() {
  const el = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(el);
  const unmount = mountSalesHistoryView(el, () => {});
  return { el, unmount };
}

beforeEach(() => {
  // jsdom no implementa scrollIntoView (se usa al cambiar de página)
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  const store = getStore();
  store.setState({
    currentUser: { id: "admin-1", role: "admin", displayName: "Admin" },
    currentWarehouse: { id: VIB, code: "VIB", name: "Víbora" },
  });
});

describe("Historial", () => {
  it("con 62 ventas muestra la paginación (antes la vista fallaba)", () => {
    SALES = Array.from({ length: 62 }, (_, i) => mkSale(i));
    let ctx;
    expect(() => { ctx = mount(); }).not.toThrow();
    expect(ctx.el.textContent).toContain("Mostrando 1-50 de 62");
    // ir a la página 2
    ctx.el.querySelector('[data-page="next"]').click();
    expect(ctx.el.textContent).toContain("Mostrando 51-62 de 62");
    ctx.unmount?.();
  });

  it("una venta en cola sale con «Por subir»", () => {
    SALES = [mkSale(1, { pendingSync: true, code: "VIB-PEND0001" }), mkSale(2)];
    const { el, unmount } = mount();
    const badges = el.querySelectorAll(".badge-pending-sync");
    expect(badges.length).toBeGreaterThan(0);
    // la marca va en la fila de la venta pendiente, no en la otra
    const rowsWithBadge = [...el.querySelectorAll("tr, .tl-card, [data-sale-id]")]
      .filter((r) => r.querySelector(".badge-pending-sync"))
      .map((r) => r.textContent);
    expect(rowsWithBadge.some((t) => t.includes("VIB-PEND0001"))).toBe(true);
    expect(rowsWithBadge.some((t) => t.includes("VIB-TEST0002"))).toBe(false);
    unmount?.();
  });
});

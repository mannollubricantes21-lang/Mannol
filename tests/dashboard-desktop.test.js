// =====================================================
// Tests: menú lateral en PC (v5.13.2)
//  · En PC (≥ 1024 px) el menú queda FIJO: sin velo oscuro ni botón cerrar, y el
//    contenedor lleva .has-dock (el CSS solo reserva su espacio entonces).
//    Antes el CSS dejaba 18rem vacíos aunque el menú no estuviera.
//  · En el móvil no cambia nada: el menú solo aparece al tocar ☰.
//  · Al navegar, se marca la sección activa y la barra superior muestra su nombre.
//  · Al pasar de PC a móvil (redimensionar) el menú se suelta.
// =====================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Las secciones no interesan aquí: solo el armazón (cabecera + menú)
vi.mock("../js/views/sales.js", () => ({ mountSalesView: () => () => {} }));
vi.mock("../js/views/stock.js", () => ({ mountStockView: () => () => {} }));
vi.mock("../js/views/commissions.js", () => ({ mountCommissionsView: () => () => {} }));
vi.mock("../js/views/transfers.js", () => ({ mountTransfersView: () => () => {} }));
vi.mock("../js/views/catalog.js", () => ({ mountCatalogView: () => () => {} }));
vi.mock("../js/views/users.js", () => ({ mountUsersView: () => () => {} }));
vi.mock("../js/views/settings.js", () => ({ mountSettingsView: () => () => {} }));
vi.mock("../js/views/sales-history.js", () => ({ mountSalesHistoryView: () => () => {} }));
vi.mock("../js/views/managers.js", () => ({ mountManagersView: () => () => {} }));
vi.mock("../js/views/warehouse-interior.js", () => ({ mountWarehouseInterior: () => () => {} }));
vi.mock("../js/components/sync-banner.js", () => ({ createSyncBanner: vi.fn(() => () => {}) }));
vi.mock("../js/auth.js", () => ({ logout: vi.fn(async () => {}) }));

import { mountDashboardView } from "../js/views/dashboard.js";
import { getStore } from "../js/store.js";

// matchMedia controlable: desktop = true → "(min-width: 1024px)" coincide
let desktop = false;
const listeners = new Set();
function setDesktop(v) {
  desktop = v;
  listeners.forEach((fn) => fn({ matches: v }));
}

beforeEach(() => {
  desktop = false;
  listeners.clear();
  window.matchMedia = vi.fn((q) => ({
    get matches() { return q.includes("min-width: 1024px") ? desktop : false; },
    media: q,
    addEventListener: (_t, fn) => { if (q.includes("min-width: 1024px")) listeners.add(fn); },
    removeEventListener: (_t, fn) => listeners.delete(fn),
    addListener() {}, removeListener() {},
  }));
  window.scrollTo = () => {};
  const store = getStore();
  store.setUser({ id: "pin-vib", role: "empleado_pin", displayName: "Empleado · VIB" });
  store.setWarehouse({ id: "11111111-1111-4111-8111-111111111111", code: "VIB", name: "Víbora" });
});

let unmount = null;
afterEach(() => { try { unmount?.(); } catch {} unmount = null; });

function mount() {
  document.body.innerHTML = "";
  const el = document.createElement("div");
  document.body.appendChild(el);
  unmount = mountDashboardView(el, () => {});
  return el;
}

describe("menú lateral en PC", () => {
  it("en PC queda fijo: sin velo ni botón cerrar, y reserva su espacio (.has-dock)", () => {
    setDesktop(true);
    const el = mount();
    const drawer = el.querySelector(".drawer");
    expect(drawer).toBeTruthy();
    expect(drawer.classList.contains("drawer--docked")).toBe(true);
    expect(el.querySelector(".drawer-overlay")).toBeNull();
    expect(el.querySelector("#close-drawer")).toBeNull();
    expect(el.querySelector(".mobile-shell").classList.contains("has-dock")).toBe(true);
    // Un empleado con PIN solo ve sus secciones (los permisos no cambian)
    const items = [...el.querySelectorAll(".drawer-item[data-drawer-nav]")].map((b) => b.dataset.drawerNav);
    expect(items).toEqual(["dashboard", "sales", "stock"]);
    expect(el.querySelector('.drawer-item.active').dataset.drawerNav).toBe("dashboard");
  });

  it("en el móvil no cambia nada: sin menú hasta tocar ☰, y sin reservar espacio", () => {
    const el = mount();
    expect(el.querySelector(".drawer")).toBeNull();
    expect(el.querySelector(".mobile-shell").classList.contains("has-dock")).toBe(false);
    el.querySelector("#open-drawer-btn").click();
    const drawer = el.querySelector(".drawer");
    expect(drawer).toBeTruthy();
    expect(drawer.classList.contains("drawer--docked")).toBe(false);
    expect(el.querySelector(".drawer-overlay")).toBeTruthy();
    el.querySelector("#close-drawer").click();
    expect(el.querySelector(".drawer")).toBeNull();
  });

  it("al navegar desde el menú fijo sigue abierto, marca la sección y la barra muestra su nombre", () => {
    setDesktop(true);
    const el = mount();
    expect(el.querySelector("#app-header-section").textContent).toBe("Inicio");
    el.querySelector('.drawer-item[data-drawer-nav="stock"]').click();
    expect(el.querySelector(".drawer.drawer--docked")).toBeTruthy();
    const active = el.querySelector(".drawer-item.active");
    expect(active.dataset.drawerNav).toBe("stock");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(el.querySelector("#app-header-section").textContent).toBe("Inventario");
  });

  it("los atajos de teclado también actualizan el menú fijo y el título", () => {
    setDesktop(true);
    const el = mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    expect(el.querySelector(".drawer-item.active").dataset.drawerNav).toBe("sales");
    expect(el.querySelector("#app-header-section").textContent).toBe("Ventas");
  });

  it("al pasar de PC a móvil el menú se suelta (y vuelve al pasar a PC)", () => {
    setDesktop(true);
    const el = mount();
    expect(el.querySelector(".drawer--docked")).toBeTruthy();
    setDesktop(false);
    expect(el.querySelector(".drawer")).toBeNull();
    expect(el.querySelector(".mobile-shell").classList.contains("has-dock")).toBe(false);
    setDesktop(true);
    expect(el.querySelector(".drawer--docked")).toBeTruthy();
  });

  it("al salir del panel deja de escuchar el cambio PC ↔ móvil", () => {
    setDesktop(true);
    mount();
    expect(listeners.size).toBe(1);
    unmount(); unmount = null;
    expect(listeners.size).toBe(0);
  });
});

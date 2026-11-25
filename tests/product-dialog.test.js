// =====================================================
// Tests: formulario «Nuevo / Editar producto» del admin (v5.15.0), en el DOM
//  · Marca: TODAS las marcas como botones (antes un datalist que, con "MANNOL"
//    puesto, no dejaba ver las demás) + «Otra marca» para escribir una nueva.
//  · Errores debajo de cada campo; no guarda si falta algo.
//  · Precios por caja en filas → se guardan con la forma de siempre.
//  · «Se puede vender», la miniatura de la foto y el aviso al cerrar sin guardar.
// =====================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../js/db.js", () => ({
  listProducts: vi.fn(async () => []),
  saveProduct: vi.fn(async (p) => p.id || "nuevo-id"),
  saveBrand: vi.fn(async () => "marca-id"),
}));
vi.mock("../js/image-upload.js", () => ({ uploadImageAsWebP: vi.fn(), pickImageFile: vi.fn() }));
vi.mock("../js/barcode-scanner.js", () => ({ openScanner: vi.fn(), canUseCamera: () => false }));

import { showProductDialog } from "../js/views/product-dialog.js";
import { saveProduct, saveBrand } from "../js/db.js";

const CATEGORIES = [
  { id: "cat-lub", name: "Lubricantes", slug: "lubricantes", icon: "🛢️", parentId: null, sortOrder: 4, active: true },
  { id: "cat-ref", name: "Refrigerante", slug: "refrigerante", icon: "❄️", parentId: null, sortOrder: 1, active: true },
];
const BRANDS = [
  { id: "b1", name: "MANNOL", sortOrder: 1 },
  { id: "b2", name: "Royal", sortOrder: 2 },
  { id: "b3", name: "Castrol", sortOrder: 3 },
  { id: "b4", name: "Liqui Moly", sortOrder: 4 },
];
const ctx = (extra = []) => ({ brands: BRANDS, known: [...BRANDS.map((b) => b.name), ...extra], missingTable: false });
const TIERS = [
  { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
  { minBoxes: 6, maxBoxes: null, pricePerUnit: 20, vendorCommission: 0.75, gestorCommission: 0.4 },
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function type(sel, value) {
  const el = typeof sel === "string" ? $(sel) : sel;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const flush = () => new Promise((r) => setTimeout(r, 0));
async function save() {
  $("#p-save").click();
  await flush(); await flush();
}

beforeEach(() => {
  document.body.innerHTML = `<div id="modal-container"></div><div id="toast-container"></div>`;
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollIntoView = function () {};
  saveProduct.mockClear();
  saveBrand.mockClear();
});

describe("marca", () => {
  it("producto nuevo: salen TODAS las marcas como botones y MANNOL ya elegida", () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx(["Total"]));
    const chips = $$(".pf-chip[data-brand]").map((b) => b.dataset.brand);
    expect(chips).toEqual(["MANNOL", "Royal", "Castrol", "Liqui Moly", "Total"]);
    expect($('.pf-chip[data-brand="MANNOL"]').getAttribute("aria-pressed")).toBe("true");
    expect($("#p-brand").value).toBe("MANNOL");
    expect($("#p-brand-list")).toBeNull(); // ya no hay datalist
  });

  it("al tocar otra marca queda elegida y se guarda", async () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    $('.pf-chip[data-brand="Liqui Moly"]').click();
    expect($('.pf-chip[data-brand="Liqui Moly"]').classList.contains("is-on")).toBe(true);
    expect($('.pf-chip[data-brand="MANNOL"]').classList.contains("is-on")).toBe(false);
    type("#p-name", "Liqui Moly Top Tec 5W-40");
    type("#p-price", "30");
    await save();
    expect(saveProduct).toHaveBeenCalledTimes(1);
    expect(saveProduct.mock.calls[0][0].brand).toBe("Liqui Moly");
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it("el nombre elige la marca sola mientras no se toque a mano", () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    type("#p-name", "Castrol GTX 20W-50");
    expect($("#p-brand").value).toBe("Castrol");
    expect($("#p-viscosity").value).toBe("20W-50");
    expect($("#p-category").value).toBe("cat-lub");
    $('.pf-chip[data-brand="Royal"]').click();
    type("#p-name", "Castrol GTX 20W-50 1 L");
    expect($("#p-brand").value).toBe("Royal");
  });

  it("«Otra marca»: marca nueva escrita a mano → se guarda bonita y se añade a la lista", async () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    expect($("#p-brand-other").hidden).toBe(true);
    $("#p-brand-other-btn").click();
    expect($("#p-brand-other").hidden).toBe(false);
    type("#p-brand-new", "fuchs titan");
    type("#p-name", "Aceite X");
    type("#p-price", "10");
    await save();
    expect(saveProduct.mock.calls[0][0].brand).toBe("Fuchs Titan");
    expect(saveBrand).toHaveBeenCalledWith({ name: "Fuchs Titan", sortOrder: 100 });
  });

  it("«Otra marca» con una que ya existe → avisa y usa la oficial (sin duplicar)", async () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    $("#p-brand-other-btn").click();
    type("#p-brand-new", "  castrol ");
    expect($("#p-brand-new-hint").textContent).toContain("«Castrol»");
    expect($('.pf-chip[data-brand="Castrol"]').classList.contains("is-match")).toBe(true);
    type("#p-name", "Aceite Y");
    type("#p-price", "10");
    await save();
    expect(saveProduct.mock.calls[0][0].brand).toBe("Castrol");
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it("editar: la marca del producto aparece elegida aunque no esté en la lista", () => {
    showProductDialog({ id: "p1", name: "Viejo", brand: "elf", salePrice: 5 }, CATEGORIES, () => {}, ctx());
    expect($$(".pf-chip[data-brand]").map((b) => b.dataset.brand)).toContain("Elf");
    expect($('.pf-chip[data-brand="Elf"]').getAttribute("aria-pressed")).toBe("true");
  });
});

describe("revisión campo a campo", () => {
  it("sin nombre ni precio: no guarda y marca cada campo", async () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    await save();
    expect(saveProduct).not.toHaveBeenCalled();
    expect($("#p-name-msg").hidden).toBe(false);
    expect($("#p-price-msg").textContent).toMatch(/precio/i);
    expect($("#p-price").getAttribute("aria-invalid")).toBe("true");
    expect($("#p-brand-msg").hidden).toBe(true);
    // al escribir, el error de ese campo se quita
    type("#p-price", "12");
    expect($("#p-price-msg").hidden).toBe(true);
    expect($("#p-price").hasAttribute("aria-invalid")).toBe(false);
  });

  it("acepta coma decimal y avisa (sin bloquear) si el vendedor no gana nada", async () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    expect($("#p-vendorCommission-warn").hidden).toBe(false);
    type("#p-name", "Aceite Z");
    type("#p-price", "22,50");
    type("#p-costPrice", "15");
    expect($("#p-margin").textContent).toMatch(/7\.50 USD/);
    type("#p-vendorCommission", "0,75");
    expect($("#p-vendorCommission-warn").hidden).toBe(true);
    await save();
    const data = saveProduct.mock.calls[0][0];
    expect(data).toMatchObject({ salePrice: 22.5, costPrice: 15, vendorCommission: 0.75, gestorCommission: 1, minStock: 5, active: true });
    expect(data).toMatchObject({ unitsPerBox: null, wholesaleTiers: [] });
  });
});

describe("venta por caja", () => {
  it("filas «desde N cajas» → tramos con la forma de siempre", async () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    expect($("#p-wh-body").hidden).toBe(true);
    const sw = $("#p-wholesale");
    sw.checked = true;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    expect($("#p-wh-body").hidden).toBe(false);
    type("#p-name", "Aceite caja");
    type("#p-price", "25");
    type("#p-unitsPerBox", "6");
    type('[data-tier-row="0"] [data-k="pricePerUnit"]', "22");
    type('[data-tier-row="0"] [data-k="vendorCommission"]', "0.5");
    $("#p-tier-add").click();
    type('[data-tier-row="1"] [data-k="minBoxes"]', "6");
    type('[data-tier-row="1"] [data-k="pricePerUnit"]', "20");
    expect($('[data-tier-row="0"] [data-tier-range]').textContent).toBe("1 a 5 cajas");
    expect($('[data-tier-row="1"] [data-tier-range]').textContent).toBe("6 cajas o más");
    expect($('[data-tier-row="0"] [data-tier-sum]').textContent).toContain("132.00 USD");
    expect($("#pf-wholesale-sub").textContent).toBe("6 pomos por caja · 2 precios");
    await save();
    const data = saveProduct.mock.calls[0][0];
    expect(data.unitsPerBox).toBe(6);
    expect(data.wholesaleTiers).toEqual([
      { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0 },
      { minBoxes: 6, maxBoxes: null, pricePerUnit: 20, vendorCommission: 0.5, gestorCommission: 0 }, // copió la comisión del anterior
    ]);
  });

  it("un «desde» que no sube marca su fila y no guarda", async () => {
    showProductDialog({ id: "p2", name: "Con caja", brand: "MANNOL", salePrice: 25, unitsPerBox: 6, wholesaleTiers: TIERS }, CATEGORIES, () => {}, ctx());
    type('[data-tier-row="1"] [data-k="minBoxes"]', "1");
    await save();
    expect(saveProduct).not.toHaveBeenCalled();
    expect($('[data-tier-row="1"] [data-tier-msg]').hidden).toBe(false);
    expect($('[data-tier-row="1"] [data-k="minBoxes"]').classList.contains("is-invalid")).toBe(true);
  });

  it("editar sin tocar nada guarda lo mismo; apagar la venta por caja la quita", async () => {
    const prod = { id: "p3", name: "Con caja", brand: "Royal", salePrice: 25, vendorCommission: 0.6, vendorCommissionCurrency: "USD", gestorCommission: 0.3, gestorCommissionCurrency: "MN", unitsPerBox: 12, wholesaleTiers: TIERS, categoryId: "cat-ref", minStock: 3, active: true };
    showProductDialog(prod, CATEGORIES, () => {}, ctx());
    expect($$("[data-tier-row]")).toHaveLength(2);
    await save();
    expect(saveProduct.mock.calls[0][0]).toMatchObject({
      id: "p3", brand: "Royal", salePrice: 25, vendorCommission: 0.6, gestorCommission: 0.3, gestorCommissionCurrency: "MN",
      unitsPerBox: 12, wholesaleTiers: TIERS, categoryId: "cat-ref", categoryName: "Refrigerante", minStock: 3,
    });
    showProductDialog(prod, CATEGORIES, () => {}, ctx());
    const sw = $$("#p-wholesale").pop();
    sw.checked = false;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    $$("#p-save").pop().click();
    await flush(); await flush();
    expect(saveProduct.mock.calls[1][0]).toMatchObject({ unitsPerBox: null, wholesaleTiers: [] });
  });
});

describe("otros", () => {
  it("un producto inactivo sigue inactivo al editarlo (antes se reactivaba solo)", async () => {
    showProductDialog({ id: "p4", name: "Oculto", brand: "MANNOL", salePrice: 9, active: false }, CATEGORIES, () => {}, ctx());
    expect($("#p-active").checked).toBe(false);
    await save();
    expect(saveProduct.mock.calls[0][0].active).toBe(false);
  });

  it("la miniatura solo se conserva si la foto no cambió", async () => {
    const prod = { id: "p5", name: "Con foto", brand: "MANNOL", salePrice: 9, imageUrl: "https://x/img.webp", thumbUrl: "https://x/thumb.webp" };
    showProductDialog(prod, CATEGORIES, () => {}, ctx());
    await save();
    expect(saveProduct.mock.calls[0][0]).toMatchObject({ imageUrl: "https://x/img.webp", thumbUrl: "https://x/thumb.webp" });
    showProductDialog(prod, CATEGORIES, () => {}, ctx());
    const img = $$("#p-image").pop();
    img.value = "https://otra/foto.jpg";
    img.dispatchEvent(new Event("change", { bubbles: true }));
    $$("#p-save").pop().click();
    await flush(); await flush();
    expect(saveProduct.mock.calls[1][0]).toMatchObject({ imageUrl: "https://otra/foto.jpg", thumbUrl: null });
  });

  it("tocar fuera con cambios pregunta antes de cerrar; sin cambios cierra", () => {
    showProductDialog(null, CATEGORIES, () => {}, ctx());
    const overlay = $(".modal-overlay");
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect($$(".modal-overlay")).toHaveLength(0);

    showProductDialog(null, CATEGORIES, () => {}, ctx());
    type("#p-name", "a medio escribir");
    $(".modal-overlay").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect($$(".modal-overlay")).toHaveLength(2); // el formulario + «¿Salir sin guardar?»
    expect($$(".modal-overlay")[1].textContent).toMatch(/Salir sin guardar/);
    $$(".modal-overlay")[1].querySelector(".modal-confirm").click();
    expect($$(".modal-overlay")).toHaveLength(0);
  });

  it("al guardar: cierra y avisa a la lista", async () => {
    const onSaved = vi.fn();
    showProductDialog(null, CATEGORIES, onSaved, ctx());
    type("#p-name", "Nuevo");
    type("#p-price", "5");
    await save();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect($$(".modal-overlay")).toHaveLength(0);
  });
});

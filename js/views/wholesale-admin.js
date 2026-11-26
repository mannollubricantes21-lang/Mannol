// =====================================================
// Admin → Venta mayorista (v5.30.0)
//
// Un solo lugar para la venta por caja: qué productos, cuántos pomos trae la
// caja, desde cuántas cajas es mayorista, el precio por caja, el % del gestor
// y en qué almacenes se puede vender. Lo que se pone aquí es lo que sale en
// «Por caja» al vender. Lógica pura en ../wholesale-config.js.
// =====================================================
import { listProducts, listWarehouses, saveProduct } from "../db.js";
import { formatMoney } from "../currency.js";
import { toast, icon, showModal, confirmDialog, esc } from "../ui.js";
import {
  wholesaleConfigOf, validateWholesaleConfig, wholesaleFieldsFrom, DEFAULT_WHOLESALE_GESTOR_PCT, wholesaleNeedsReview,
} from "../wholesale-config.js";

const whNames = (ids, warehouses) => {
  if (!ids) return "Todos los almacenes";
  const names = ids.map((id) => warehouses.find((w) => String(w.id) === id)?.name || "—");
  return names.join(", ");
};

/** Campos a guardar, sin tocar el resto del producto. */
function productPatch(p, fields) {
  return { id: p.id, name: p.name, brand: p.brand, ...fields };
}

export function mountWholesalePanel(content, { isStale = () => false } = {}) {
  content.innerHTML = `<div class="card"><div class="card-content"><div class="spinner"></div></div></div>`;
  Promise.all([listProducts(), listWarehouses()]).then(([products, warehouses]) => {
    if (isStale()) return;
    products = products || [];
    warehouses = warehouses || [];
    const rows = products
      .map((p) => ({ p, cfg: wholesaleConfigOf(p) }))
      .filter((r) => r.cfg)
      .sort((a, b) => a.p.name.localeCompare(b.p.name));
    const reload = () => mountWholesalePanel(content, { isStale });
    const toReview = rows.filter((r) => wholesaleNeedsReview(r.p)).length;

    content.innerHTML = `
      <div class="card wsa">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
          <h3 class="card-title">Venta mayorista (${rows.length})</h3>
          <button class="btn btn-primary btn-sm" id="wsa-new" type="button">${icon("plus", 14)} Agregar producto</button>
        </div>
        <div class="card-content">
          <p class="wsa-intro">Los productos que se venden <strong>por caja</strong>. El vendedor cobra por venta como siempre; el gestor cobra el % que pongas en cada producto.</p>
          ${toReview ? `<div class="wsa-review-note">${icon("alertTriangle", 16)}<span><strong>${toReview} ${toReview === 1 ? "producto viene" : "productos vienen"} de la versión anterior.</strong> Toca «Editar», pon el mínimo real de cajas y guarda.</span></div>` : ""}
          ${rows.length === 0 ? `
            <div class="empty-state" style="padding:1.5rem 0.5rem">
              <div class="empty-state-icon">${icon("boxes", 24)}</div>
              <p class="empty-state-title">Ningún producto por caja todavía</p>
              <p class="empty-state-desc">Toca «Agregar producto» y pon las cajas mínimas y el precio.</p>
            </div>` : `
            <ul class="wsa-list">
              ${rows.map(({ p, cfg }) => `
                <li class="wsa-item${p.active === false ? " is-off" : ""}">
                  <div class="wsa-main">
                    <p class="wsa-name">${esc(p.name)}${p.brand ? ` <span>· ${esc(p.brand)}</span>` : ""}${wholesaleNeedsReview(p) ? ` <em class="wsa-review">Revisar</em>` : ""}</p>
                    <div class="wsa-facts">
                      <span><small>Desde</small><strong>${cfg.minBoxes}</strong> caja${cfg.minBoxes === 1 ? "" : "s"}</span>
                      <span><small>Precio</small><strong>${formatMoney(cfg.pricePerBox, "USD")}</strong>/caja</span>
                      <span><small>Caja</small><strong>${cfg.unitsPerBox}</strong> pomos</span>
                      <span><small>Gestor</small><strong>${cfg.gestorPct}%</strong></span>
                      <span><small>Vendedor</small><strong>${cfg.vendorAmount === null ? "Regla" : formatMoney(cfg.vendorAmount, "USD")}</strong>por venta</span>
                    </div>
                    <p class="wsa-wh">${icon("store", 12)} ${esc(whNames(cfg.warehouseIds, warehouses))}${p.active === false ? " · producto inactivo" : ""}</p>
                  </div>
                  <div class="wsa-actions">
                    <button class="btn btn-secondary btn-sm" type="button" data-wsa-edit="${esc(p.id)}">Editar</button>
                    <button class="btn btn-text btn-sm text-danger" type="button" data-wsa-del="${esc(p.id)}" aria-label="Quitar ${esc(p.name)} de venta mayorista">Quitar</button>
                  </div>
                </li>`).join("")}
            </ul>`}
        </div>
      </div>`;

    content.querySelector("#wsa-new").addEventListener("click", () => openDialog(null, products, warehouses, reload));
    content.querySelectorAll("[data-wsa-edit]").forEach((b) => b.addEventListener("click", () => {
      const p = products.find((x) => x.id === b.dataset.wsaEdit);
      if (p) openDialog(p, products, warehouses, reload);
    }));
    content.querySelectorAll("[data-wsa-del]").forEach((b) => b.addEventListener("click", () => {
      const p = products.find((x) => x.id === b.dataset.wsaDel);
      if (!p) return;
      confirmDialog(`¿Quitar «${p.name}» de la venta por caja? Se podrá seguir vendiendo por unidad.`, async () => {
        try {
          await saveProduct(productPatch(p, wholesaleFieldsFrom(null)));
          toast("Quitado de venta mayorista", "success");
          reload();
        } catch (err) {
          toast("No se pudo guardar: " + (err?.message || "error"), "error", 6000);
        }
      });
    }));
  }).catch((err) => {
    if (isStale()) return;
    content.innerHTML = `<div class="card"><div class="card-content text-danger">No se pudo cargar: ${esc(err?.message || "error")}</div></div>`;
  });
}

function openDialog(product, products, warehouses, onSaved) {
  const isNew = !product;
  const cfg = product ? wholesaleConfigOf(product) : null;
  const candidates = products
    .filter((p) => p.active !== false && (!wholesaleConfigOf(p) || p.id === product?.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  let selectedId = product?.id || "";
  let whIds = cfg?.warehouseIds ? [...cfg.warehouseIds] : [];

  const productOptions = (filter = "") => {
    const f = filter.trim().toLowerCase();
    const list = candidates.filter((p) => !f || `${p.name} ${p.brand || ""} ${p.sku || ""}`.toLowerCase().includes(f));
    return `<option value="">${list.length ? "Elige el producto…" : "Ninguno coincide"}</option>` +
      list.map((p) => `<option value="${esc(p.id)}"${p.id === selectedId ? " selected" : ""}>${esc(p.name)}${p.brand ? ` · ${esc(p.brand)}` : ""} — ${formatMoney(p.salePrice, "USD")} c/u</option>`).join("");
  };

  const body = `
    <div class="wsa-form">
      ${isNew ? `
        <div class="wsa-field wsa-span2">
          <label class="label" for="wsa-product">Producto</label>
          <input class="input" id="wsa-search" placeholder="Buscar por nombre…" autocomplete="off" />
          <select class="select" id="wsa-product" style="margin-top:0.375rem">${productOptions()}</select>
          <p class="pf-msg" id="wsa-productId-msg" hidden></p>
        </div>` : `
        <div class="wsa-field wsa-span2"><span class="label">Producto</span><p class="wsa-fixed">${esc(product.name)}${product.brand ? ` · ${esc(product.brand)}` : ""}</p></div>`}
      <div class="wsa-field">
        <label class="label" for="wsa-unitsPerBox">Pomos por caja</label>
        <input class="input" id="wsa-unitsPerBox" inputmode="numeric" placeholder="Ej: 12" value="${esc(cfg?.unitsPerBox ?? "")}" />
        <p class="pf-msg" id="wsa-unitsPerBox-msg" hidden></p>
      </div>
      <div class="wsa-field">
        <label class="label" for="wsa-minBoxes">Mínimo de cajas</label>
        <input class="input" id="wsa-minBoxes" inputmode="numeric" placeholder="Ej: 10" value="${esc(cfg?.minBoxes ?? "")}" />
        <p class="pf-msg" id="wsa-minBoxes-msg" hidden></p>
      </div>
      <div class="wsa-field">
        <label class="label" for="wsa-pricePerBox">Precio por caja (USD)</label>
        <input class="input" id="wsa-pricePerBox" inputmode="decimal" placeholder="0.00" value="${esc(cfg?.pricePerBox ?? "")}" />
        <p class="pf-msg" id="wsa-pricePerBox-msg" hidden></p>
      </div>
      <div class="wsa-field">
        <label class="label" for="wsa-gestorPct">Comisión gestor %</label>
        <input class="input" id="wsa-gestorPct" inputmode="decimal" placeholder="${DEFAULT_WHOLESALE_GESTOR_PCT}" value="${esc(cfg?.gestorPct ?? DEFAULT_WHOLESALE_GESTOR_PCT)}" />
        <p class="pf-msg" id="wsa-gestorPct-msg" hidden></p>
      </div>
      <div class="wsa-field wsa-span2">
        <label class="label" for="wsa-vendorAmount">Vendedor del almacén gana por esa venta (USD)</label>
        <input class="input" id="wsa-vendorAmount" inputmode="decimal" placeholder="Vacío = regla por venta (1 USD)" value="${esc(cfg?.vendorAmount ?? "")}" />
        <p class="pf-hint" style="margin:0.25rem 0 0">Vacío: cobra como en cualquier venta. Al vender se puede cambiar.</p>
        <p class="pf-msg" id="wsa-vendorAmount-msg" hidden></p>
      </div>
      <p class="wsa-calc wsa-span2" id="wsa-calc" aria-live="polite"></p>
      <div class="wsa-field wsa-span2">
        <span class="label">Almacenes donde se vende por caja</span>
        <div class="wsa-whs" id="wsa-whs">
          <button type="button" class="pf-chip${whIds.length ? "" : " is-on"}" data-wsa-wh="" aria-pressed="${!whIds.length}">Todos</button>
          ${warehouses.map((w) => `<button type="button" class="pf-chip${whIds.includes(String(w.id)) ? " is-on" : ""}" data-wsa-wh="${esc(w.id)}" aria-pressed="${whIds.includes(String(w.id))}">${esc(w.name)}</button>`).join("")}
        </div>
      </div>
      ${cfg?.extraTiers ? `<p class="pf-warn wsa-span2">Este producto tenía ${cfg.extraTiers + 1} precios por cantidad. Al guardar queda uno solo: el de aquí.</p>` : ""}
    </div>`;

  const close = showModal({
    title: isNew ? "Producto por caja" : "Editar venta por caja",
    body,
    footer: `<button class="btn btn-secondary" id="wsa-cancel" type="button">Cancelar</button><button class="btn btn-primary" id="wsa-save" type="button">${icon("check", 16)} Guardar</button>`,
  });
  const overlays = document.querySelectorAll("#modal-container .modal-overlay");
  const ov = overlays[overlays.length - 1];
  if (!ov) return;
  const $ = (s) => ov.querySelector(s);

  const read = () => ({
    productId: isNew ? $("#wsa-product").value : product.id,
    unitsPerBox: $("#wsa-unitsPerBox").value.trim(),
    minBoxes: $("#wsa-minBoxes").value.trim(),
    pricePerBox: $("#wsa-pricePerBox").value.trim(),
    gestorPct: $("#wsa-gestorPct").value.trim(),
    vendorAmount: $("#wsa-vendorAmount").value.trim(),
    warehouseIds: whIds,
  });
  const setMsg = (key, text) => {
    const m = $(`#wsa-${key}-msg`);
    if (m) { m.hidden = !text; m.textContent = text || ""; }
    const inp = $(key === "productId" ? "#wsa-product" : `#wsa-${key}`);
    inp?.classList.toggle("is-invalid", !!text);
  };
  const paintCalc = () => {
    const v = read();
    const units = Number(v.unitsPerBox), price = Number(String(v.pricePerBox).replace(",", "."));
    const min = Number(v.minBoxes), pct = v.gestorPct === "" ? DEFAULT_WHOLESALE_GESTOR_PCT : Number(String(v.gestorPct).replace(",", "."));
    const el = $("#wsa-calc");
    if (units > 0 && price > 0) {
      const p = products.find((x) => x.id === v.productId);
      const per = price / units;
      const retail = Number(p?.salePrice) || 0;
      const atMin = min > 0 ? price * min : 0;
      el.innerHTML = `Sale a <strong>${formatMoney(per, "USD")}</strong> el pomo${retail ? ` (por unidad: ${formatMoney(retail, "USD")})` : ""}.` +
        (atMin ? ` Venta mínima: ${min} cajas = <strong>${formatMoney(atMin, "USD")}</strong>, gestor ${formatMoney(atMin * (pct || 0) / 100, "USD")}.` : "");
    } else {
      el.textContent = "";
    }
  };

  $("#wsa-cancel").addEventListener("click", close);
  $("#wsa-search")?.addEventListener("input", (e) => {
    selectedId = $("#wsa-product").value;
    $("#wsa-product").innerHTML = productOptions(e.target.value);
  });
  $("#wsa-product")?.addEventListener("change", (e) => { selectedId = e.target.value; setMsg("productId", ""); paintCalc(); });
  ["unitsPerBox", "minBoxes", "pricePerBox", "gestorPct", "vendorAmount"].forEach((k) => $(`#wsa-${k}`).addEventListener("input", () => { setMsg(k, ""); paintCalc(); }));
  $("#wsa-whs").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-wsa-wh]");
    if (!chip) return;
    const id = chip.dataset.wsaWh;
    if (!id) whIds = [];
    else whIds = whIds.includes(id) ? whIds.filter((x) => x !== id) : [...whIds, id];
    if (whIds.length === warehouses.length) whIds = [];
    $("#wsa-whs").querySelectorAll("[data-wsa-wh]").forEach((c) => {
      const on = c.dataset.wsaWh ? whIds.includes(c.dataset.wsaWh) : !whIds.length;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", String(on));
    });
  });

  $("#wsa-save").addEventListener("click", async () => {
    const res = validateWholesaleConfig(read());
    ["productId", "unitsPerBox", "minBoxes", "pricePerBox", "gestorPct", "vendorAmount"].forEach((k) => setMsg(k, res.errors[k] || ""));
    if (!res.ok) { toast("Revisa lo marcado en rojo", "error"); return; }
    const p = products.find((x) => x.id === res.values.productId);
    if (!p) { toast("Producto no encontrado", "error"); return; }
    const btn = $("#wsa-save");
    btn.disabled = true;
    try {
      await saveProduct(productPatch(p, wholesaleFieldsFrom(res.values)));
      toast("Venta por caja guardada", "success");
      close();
      onSaved();
    } catch (err) {
      btn.disabled = false;
      toast("No se pudo guardar: " + (err?.message || "error"), "error", 6000);
    }
  });
  paintCalc();
}

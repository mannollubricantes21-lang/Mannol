// =====================================================
// Admin → Productos: formulario «Nuevo / Editar producto» (v5.15.0)
//
// Antes era una lista larga de campos sueltos dentro de admin.js. Ahora:
//  1. Producto — nombre, MARCA (todas las marcas como botones + «Otra marca»),
//     tipo y viscosidad (salen solos del nombre), código de barras, se puede vender.
//  2. Precio y stock — precio, costo (con la ganancia al momento), stock mínimo.
//  3. Foto.
//  v5.30.0: sin comisiones por producto (vendedor: regla por venta; gestor: su
//  %) y sin venta por caja (ahora en Admin → Venta mayorista).
// Los números aceptan coma o punto, y cada error sale debajo de su campo.
// La lógica pura (y sus pruebas) está en ../product-form.js.
// =====================================================
import { listProducts, saveProduct, saveBrand } from "../db.js";
import { toast, icon, showModal, confirmDialog, esc } from "../ui.js";
import { canonicalBrand, normalizeKey, sortCategories, suggestBrand, suggestCategoryId } from "../catalog-facets.js";
import { uploadImageAsWebP, pickImageFile } from "../image-upload.js";
import { findProductByCode } from "../sales-stats.js";
import { openScanner, canUseCamera } from "../barcode-scanner.js";
import { detectViscosityFromName } from "../viscosity.js";
import {
  parseDecimal, numberToInput, money2, brandChoices, findBrand, marginInfo, validateProductForm,
} from "../product-form.js";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Campo del formulario → id del control (para marcar errores)
const FIELD_IDS = {
  name: "p-name",
  brand: "p-brand",
  price: "p-price",
  costPrice: "p-costPrice",
  minStock: "p-minStock",
};

/**
 * Abre el formulario de producto.
 * @param {object|null} product  producto a editar (null = nuevo)
 * @param {object[]} categories   categorías (tipos) del catálogo
 * @param {Function} onSaved      se llama después de guardar
 * @param {{brands?:object[], known?:string[], missingTable?:boolean}} brandCtx
 */
export function showProductDialog(product, categories = [], onSaved = () => {}, brandCtx = {}) {
  const isNew = !product;
  const p = product || {};
  const registeredBrands = (brandCtx.brands || []).map((b) => b.name);
  const { list: brandList, selected: ownBrand } = brandChoices(brandCtx.known || [], p.brand || "");
  // Producto nuevo: la primera marca de la lista (MANNOL) ya elegida, como antes
  let brandValue = ownBrand || (isNew ? brandList[0] || "" : "");
  let brandMode = brandValue ? "list" : (brandList.length ? "list" : "other");
  let brandTouched = !isNew;


  const camera = canUseCamera();
  // v5.31.0: comisión fija propia (cargadores, breakers…), aparte de la regla
  const ownOn = !!p.ownVendorCommission;
  const ownCur = p.vendorCommissionCurrency === "MN" ? "MN" : "USD";

  const rootCats = sortCategories(categories.filter((c) => !c.parentId));
  const catOptions = `<option value="">Sin tipo</option>` + rootCats.map((c) => `
      <option value="${esc(c.id)}"${p.categoryId === c.id ? " selected" : ""}>${esc(c.icon ? `${c.icon} ` : "")}${esc(c.name)}</option>
      ${sortCategories(categories.filter((x) => x.parentId === c.id)).map((x) => `<option value="${esc(x.id)}"${p.categoryId === x.id ? " selected" : ""}>   └ ${esc(x.name)}</option>`).join("")}`).join("");

  // ---------- piezas de la plantilla ----------
  const msg = (id) => `<p class="pf-msg" id="${id}-msg" hidden></p>`;
  const warn = (id) => `<p class="pf-warn" id="${id}-warn" hidden></p>`;
  const hint = (id, text) => (text ? `<p class="pf-hint" id="${id}-hint">${text}</p>` : "");
  const described = (id, withHint) => `aria-describedby="${withHint ? `${id}-hint ` : ""}${id}-msg"`;
  const section = (id, ico, title, sub, inner, head = "") => `
    <section class="pf-sec" id="${id}" aria-labelledby="${id}-t">
      <div class="pf-sec-head">
        <span class="pf-sec-ico" aria-hidden="true">${icon(ico, 16)}</span>
        <div class="pf-sec-titles">
          <h4 class="pf-sec-title" id="${id}-t">${title}</h4>
          ${sub ? `<p class="pf-sec-sub" id="${id}-sub">${sub}</p>` : ""}
        </div>
        ${head}
      </div>
      ${inner}
    </section>`;
  const brandChip = (name) => {
    const on = brandMode === "list" && name === brandValue;
    return `<button type="button" class="pf-chip${on ? " is-on" : ""}" data-brand="${esc(name)}" aria-pressed="${on}">${esc(name)}</button>`;
  };
  const body = `
    <div class="pf" id="p-form">
      ${section("pf-basic", "tags", "Producto", "", `
        <div class="pf-grid">
          <div class="pf-field pf-span2">
            <label class="pf-label" for="p-name">Nombre <span class="pf-req" aria-hidden="true">*</span></label>
            <input class="input" id="p-name" autocomplete="off" autocapitalize="sentences" enterkeyhint="next" placeholder="Ej: MANNOL 5W-30 Energy Formula 4 L" value="${esc(p.name || "")}" ${described("p-name", false)} />
            ${msg("p-name")}
          </div>
          <div class="pf-field pf-span2">
            <span class="pf-label" id="p-brand-label">Marca <span class="pf-req" aria-hidden="true">*</span></span>
            <div class="pf-chips" id="p-brand-chips" role="group" aria-labelledby="p-brand-label" aria-describedby="p-brand-msg">
              ${brandList.map(brandChip).join("")}
              <button type="button" class="pf-chip pf-chip--add${brandMode === "other" ? " is-on" : ""}" id="p-brand-other-btn" aria-pressed="${brandMode === "other"}" aria-controls="p-brand-other">${icon("plus", 14)} Otra marca</button>
            </div>
            <div class="pf-other" id="p-brand-other"${brandMode === "other" ? "" : " hidden"}>
              <input class="input" id="p-brand-new" autocomplete="off" autocapitalize="words" placeholder="Escribe la marca nueva" aria-label="Marca nueva" aria-describedby="p-brand-new-hint" value="${brandMode === "other" ? esc(brandValue) : ""}" />
              <p class="pf-hint" id="p-brand-new-hint">Se añade a la lista de marcas y la verán todos.</p>
            </div>
            <input type="hidden" id="p-brand" value="${esc(brandValue)}" />
            ${msg("p-brand")}
          </div>
          <div class="pf-field">
            <label class="pf-label" for="p-category">Tipo</label>
            <select class="select" id="p-category" aria-describedby="p-category-hint">${catOptions}</select>
            <p class="pf-hint" id="p-category-hint"></p>
          </div>
          <div class="pf-field">
            <label class="pf-label" for="p-viscosity">Viscosidad</label>
            <input class="input" id="p-viscosity" autocomplete="off" placeholder="Ej: 5W-30" value="${esc(p.viscosity || "")}" aria-describedby="p-viscosity-hint" />
            ${hint("p-viscosity", "Sale sola del nombre")}
          </div>
          <div class="pf-field pf-span2">
            <label class="pf-label" for="p-sku">Código de barras / SKU</label>
            <div class="${camera ? "input-scan" : ""}" style="position:relative">
              <input class="input" id="p-sku" autocomplete="off" placeholder="${camera ? "Escríbelo o escanéalo" : "Opcional"}" value="${esc(p.sku || "")}" aria-describedby="p-sku-hint" />
              ${camera ? `<button type="button" class="scan-btn" id="p-sku-scan" aria-label="Escanear el código de barras del producto" title="Escanear código de barras">${icon("scan", 18)}</button>` : ""}
            </div>
            ${hint("p-sku", "Con el código guardado, en la venta se añade escaneando el envase")}
          </div>
          <label class="pf-switch pf-span2" for="p-active">
            <input type="checkbox" id="p-active"${p.active === false ? "" : " checked"} />
            <span class="pf-switch-track" aria-hidden="true"></span>
            <span class="pf-switch-text"><strong>Se puede vender</strong><small>Apágalo para ocultarlo de la venta sin borrarlo</small></span>
          </label>
        </div>`)}

      ${section("pf-price", "dollar", "Precio y stock", "", `
        <div class="pf-grid pf-grid--3">
          <div class="pf-field">
            <label class="pf-label" for="p-price">Precio de venta <span class="pf-req" aria-hidden="true">*</span></label>
            <div class="pf-ig"><input class="input" id="p-price" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(numberToInput(p.salePrice || ""))}" ${described("p-price", false)} /><span class="pf-unit">USD</span></div>
            ${msg("p-price")}
          </div>
          <div class="pf-field">
            <label class="pf-label" for="p-costPrice">Costo</label>
            <div class="pf-ig"><input class="input" id="p-costPrice" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(numberToInput(p.costPrice || ""))}" ${described("p-costPrice", true)} /><span class="pf-unit">USD</span></div>
            ${hint("p-costPrice", "Lo que te cuesta: sirve para ver la ganancia")}
            ${msg("p-costPrice")}${warn("p-costPrice")}
          </div>
          <p class="pf-margin pf-span2" id="p-margin" aria-live="polite"></p>
          <div class="pf-field">
            <label class="pf-label" for="p-minStock">Stock mínimo</label>
            <div class="pf-ig"><input class="input" id="p-minStock" inputmode="numeric" autocomplete="off" placeholder="5" value="${esc(numberToInput(p.minStock ?? 5))}" ${described("p-minStock", true)} /><span class="pf-unit">unid.</span></div>
            ${hint("p-minStock", "Avisa cuando quedan menos")}
            ${msg("p-minStock")}
          </div>
        </div>`)}

      ${section("pf-own", "wallet", "Comisión propia del vendedor", ownOn ? `${esc(numberToInput(p.vendorCommission))} ${ownCur} por unidad` : "No: cobra por venta (lo normal)", `
        <div class="pf-own-body" id="p-own-body"${ownOn ? "" : " hidden"}>
          <div class="pf-grid">
            <div class="pf-field pf-field--wide">
              <label class="pf-label" for="p-ownAmount">Gana por cada unidad</label>
              <div class="pf-ig">
                <input class="input" id="p-ownAmount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(ownOn ? numberToInput(p.vendorCommission) : "")}" aria-describedby="p-ownAmount-hint p-ownAmount-msg" />
                <select class="select" id="p-ownCurrency" aria-label="Moneda">${["USD", "MN"].map((c) => `<option value="${c}"${ownCur === c ? " selected" : ""}>${c}</option>`).join("")}</select>
              </div>
              <p class="pf-hint" id="p-ownAmount-hint">Va aparte de la regla por venta.</p>
              <p class="pf-msg" id="p-ownAmount-msg" hidden></p>
            </div>
          </div>
        </div>
        <p class="pf-hint pf-comm-note">${icon("wallet", 14)} <span>Solo para productos que van aparte (cargadores, breakers…). Los demás: el vendedor cobra <strong>por venta</strong> y el gestor su %. La venta por caja está en <strong>Admin → Venta mayorista</strong>.</span></p>`, `
        <label class="pf-switch pf-switch--head" for="p-own">
          <input type="checkbox" id="p-own"${ownOn ? " checked" : ""} aria-describedby="pf-own-sub" />
          <span class="pf-switch-track" aria-hidden="true"></span>
          <span class="sr-only">Comisión fija propia</span>
        </label>`)}


      ${section("pf-image", "image", "Foto", "", `
        <div class="pf-image">
          <div id="p-image-preview" class="pf-thumb">
            ${p.imageUrl ? `<img src="${esc(p.thumbUrl || p.imageUrl)}" alt="" />` : icon("image", 22)}
          </div>
          <div class="pf-image-side">
            <div class="pf-image-btns">
              <button type="button" class="btn btn-outline btn-sm" id="p-upload-btn">${icon("image", 14)} Subir foto</button>
              <button type="button" class="btn btn-ghost btn-sm" id="p-image-clear"${p.imageUrl ? "" : " hidden"}>${icon("trash", 14)} Quitar</button>
            </div>
            <input class="input" id="p-image" autocomplete="off" inputmode="url" placeholder="…o pega el enlace de una foto" aria-label="Enlace de la foto" value="${esc(p.imageUrl || "")}" />
            <p class="pf-hint" id="p-image-info">Se convierte a WebP automáticamente</p>
          </div>
        </div>`)}
    </div>`;

  const close = showModal({
    title: isNew ? "Nuevo producto" : "Editar producto",
    size: "lg",
    body,
    footer: `<button class="btn btn-outline" id="p-cancel" type="button">Cancelar</button><button class="btn btn-primary" id="p-save" type="button">${icon("check", 16)} ${isNew ? "Crear producto" : "Guardar cambios"}</button>`,
  });

  const overlays = document.querySelectorAll("#modal-container .modal-overlay");
  const overlay = overlays[overlays.length - 1];
  if (!overlay) return close;
  overlay.querySelector(".modal")?.classList.add("modal--product");
  const $ = (sel) => overlay.querySelector(sel);

  const nameInput = $("#p-name");
  const viscInput = $("#p-viscosity");
  const catSelect = $("#p-category");
  const catHint = $("#p-category-hint");
  const brandHidden = $("#p-brand");
  const brandChips = $("#p-brand-chips");
  const otherBox = $("#p-brand-other");
  const otherInput = $("#p-brand-new");
  const otherBtn = $("#p-brand-other-btn");
  const priceInput = $("#p-price");
  const costInput = $("#p-costPrice");
  const minStockInput = $("#p-minStock");
  const activeInput = $("#p-active");
  const ownToggle = $("#p-own");
  const ownAmount = $("#p-ownAmount");
  const ownMsg = $("#p-ownAmount-msg");
  const paintOwn = () => {
    $("#p-own-body").hidden = !ownToggle.checked;
    const sub = $("#pf-own-sub");
    const a = parseDecimal(ownAmount.value);
    if (sub) sub.textContent = ownToggle.checked ? (a > 0 ? `${numberToInput(a)} ${$("#p-ownCurrency").value} por unidad` : "Pon cuánto gana por unidad") : "No: cobra por venta (lo normal)";
  };
  ownToggle.addEventListener("change", () => { paintOwn(); if (ownToggle.checked && !ownAmount.value.trim()) { try { ownAmount.focus(); } catch {} } });
  ownAmount.addEventListener("input", () => { ownMsg.hidden = true; ownAmount.classList.remove("is-invalid"); paintOwn(); });
  $("#p-ownCurrency").addEventListener("change", paintOwn);

  $("#p-cancel").addEventListener("click", close);

  // ---------- mensajes bajo cada campo ----------
  function setMsg(key, text) {
    const id = FIELD_IDS[key];
    const el = $(`#${id}-msg`);
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    if (key === "brand") {
      brandChips.classList.toggle("is-invalid", !!text);
      return;
    }
    const input = $(`#${id}`);
    if (input && input.matches("input, select, textarea")) {
      input.classList.toggle("is-invalid", !!text);
      if (text) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }
  function setWarn(key, text) {
    const el = $(`#${FIELD_IDS[key]}-warn`);
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }
  // ---------- marca ----------
  function paintBrand() {
    const typed = otherInput.value;
    const match = brandMode === "other" ? findBrand(typed, brandList) : "";
    brandChips.querySelectorAll("[data-brand]").forEach((b) => {
      const on = brandMode === "list" && b.dataset.brand === brandValue;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-match", !!match && b.dataset.brand === match);
    });
    otherBtn.classList.toggle("is-on", brandMode === "other");
    otherBtn.setAttribute("aria-pressed", brandMode === "other" ? "true" : "false");
    otherBox.hidden = brandMode !== "other";
    brandHidden.value = brandMode === "other" ? typed.replace(/\s+/g, " ").trim() : brandValue;
    const h = $("#p-brand-new-hint");
    if (h) {
      h.textContent = match
        ? `Ya está en la lista: se guardará como «${match}».`
        : "Se añade a la lista de marcas y la verán todos.";
    }
  }
  brandChips.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-brand]");
    if (chip) {
      brandMode = "list";
      brandValue = chip.dataset.brand;
      brandTouched = true;
      setMsg("brand", "");
      paintBrand();
      return;
    }
    if (e.target.closest("#p-brand-other-btn")) {
      brandMode = "other";
      brandTouched = true;
      paintBrand();
      try { otherInput.focus(); } catch {}
    }
  });
  otherInput.addEventListener("input", () => { setMsg("brand", ""); paintBrand(); });

  // ---------- nombre → viscosidad, marca y tipo ----------
  // La viscosidad, la marca y el tipo se deducen del nombre mientras no se
  // elijan a mano (nunca se pisa lo que el usuario puso).
  let lastAutoViscosity = null;
  let categoryTouched = !!p.categoryId;
  let lastAutoCategory = null;
  function autoCategory() {
    if (categoryTouched) return;
    if (catSelect.value && catSelect.value !== lastAutoCategory) return;
    const id = suggestCategoryId({ name: nameInput.value, viscosity: viscInput.value }, categories) || "";
    if (catSelect.value !== id) catSelect.value = id;
    lastAutoCategory = id || null;
    catHint.textContent = id ? "Elegido según el nombre · puedes cambiarlo" : "";
  }
  nameInput.addEventListener("input", () => {
    setMsg("name", "");
    const detected = detectViscosityFromName(nameInput.value);
    if (detected) {
      const current = viscInput.value.trim();
      if (!current || current === lastAutoViscosity) {
        if (current !== detected) viscInput.value = detected;
        lastAutoViscosity = detected;
      }
    }
    if (!brandTouched && brandList.length) {
      const hit = suggestBrand({ name: nameInput.value }, brandList);
      if (hit && brandList.includes(hit) && (brandMode !== "list" || brandValue !== hit)) {
        brandMode = "list";
        brandValue = hit;
        paintBrand();
      }
    }
    autoCategory();
  });
  viscInput.addEventListener("input", autoCategory);
  catSelect.addEventListener("change", () => { categoryTouched = true; catHint.textContent = ""; });

  // ---------- precio y costo ----------
  function paintMoney() {
    const m = marginInfo(priceInput.value, costInput.value);
    const el = $("#p-margin");
    if (m) {
      el.className = `pf-margin pf-span2 ${m.profit >= 0 ? "is-good" : "is-bad"}`;
      el.innerHTML = m.profit >= 0
        ? `${icon("trendingUp", 14)} <span>Ganas <strong>${money2(m.profit)} USD</strong> por unidad (${m.pct}% sobre el costo)</span>`
        : `${icon("trendingDown", 14)} <span>Pierdes <strong>${money2(-m.profit)} USD</strong> por unidad</span>`;
    } else {
      el.className = "pf-margin pf-span2";
      el.textContent = parseDecimal(priceInput.value) > 0 && !costInput.value.trim() ? "Pon el costo para ver cuánto ganas por unidad" : "";
    }
    el.hidden = !el.textContent;
    const check = validateProductForm({ price: priceInput.value, costPrice: costInput.value });
    setWarn("costPrice", check.errors.costPrice ? "" : check.warnings.costPrice || "");
  }
  [
    [priceInput, "price"], [costInput, "costPrice"], [minStockInput, "minStock"],
  ].forEach(([el, key]) => el.addEventListener("input", () => { setMsg(key, ""); paintMoney(); }));

  // ---------- foto ----------
  const uploadBtn = $("#p-upload-btn");
  const imageInput = $("#p-image");
  const imagePreview = $("#p-image-preview");
  const imageInfo = $("#p-image-info");
  const clearBtn = $("#p-image-clear");
  let uploadedImageUrl = p.imageUrl || null;
  let uploadedThumbUrl = p.thumbUrl || null; // miniatura 200px (se genera al subir)
  const showPreview = (url) => {
    if (url) {
      imagePreview.innerHTML = `<img src="${esc(url)}" alt="" />`;
      const img = imagePreview.querySelector("img");
      img.addEventListener("error", () => { imagePreview.innerHTML = icon("image", 22); }, { once: true });
    } else {
      imagePreview.innerHTML = icon("image", 22);
    }
    clearBtn.hidden = !url;
  };
  uploadBtn.addEventListener("click", async () => {
    try {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = `<div class="spinner spinner-sm"></div> Convirtiendo...`;
      const file = await pickImageFile("image/jpeg,image/png,image/webp,image/jpg");
      uploadBtn.innerHTML = `<div class="spinner spinner-sm"></div> Subiendo...`;
      const result = await uploadImageAsWebP(file, "products");
      uploadedImageUrl = result.url;
      uploadedThumbUrl = result.thumbUrl || null;
      imageInput.value = result.url;
      showPreview(result.thumbUrl || result.url);
      const savedText = result.savedPct > 0 ? ` · ${result.savedPct}% más pequeño` : "";
      const thumbText = result.thumbUrl ? ` · miniatura ${formatBytes(result.thumbSize)}` : "";
      imageInfo.innerHTML = `<span style="color:var(--accent)">WebP ${formatBytes(result.webpSize)}${savedText}${thumbText}</span>`;
      toast(`Imagen convertida a WebP${savedText}`, "success");
    } catch (err) {
      if (err?.message !== "No se seleccionó ningún archivo") {
        toast("Error al subir imagen: " + (err?.message || "error"), "error");
      }
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = `${icon("image", 14)} Subir foto`;
    }
  });
  imageInput.addEventListener("change", () => {
    const url = imageInput.value.trim();
    showPreview(url && url === uploadedImageUrl ? uploadedThumbUrl || url : url);
  });
  clearBtn.addEventListener("click", () => {
    imageInput.value = "";
    showPreview("");
    imageInfo.textContent = "Se convierte a WebP automáticamente";
  });

  // v5.10.0: escanear el código de barras del envase → queda guardado en el SKU
  // (así en la venta se añade el producto escaneándolo)
  $("#p-sku-scan")?.addEventListener("click", () => {
    openScanner({
      title: "Código de barras del producto",
      hint: "Apunta al código de barras del envase",
      onCode: async (code) => {
        const input = $("#p-sku");
        if (input) input.value = code;
        try {
          const all = await listProducts();
          const other = findProductByCode((all || []).filter((x) => x.id !== p.id), code);
          if (other) setTimeout(() => toast(`Atención: el código ${code} ya está en “${other.name}”`, "warning", 6000), 400);
        } catch {}
        return { ok: true, message: `Código ${code} · recuerda Guardar` };
      },
    });
  });

  // ---------- cerrar sin querer ----------
  // Un toque fuera de la hoja la cerraba y se perdía lo escrito: si hay cambios, se pregunta.
  const snapshot = () => JSON.stringify([
    [...overlay.querySelectorAll(".modal-body input, .modal-body select")].map((el) => (el.type === "checkbox" ? el.checked : el.value)),
    brandHidden.value,
  ]);
  let initialState = null; // se toma al final, con todo ya pintado
  overlay.addEventListener("click", (e) => {
    if (e.target !== overlay) return;
    if (initialState === null || snapshot() === initialState) return;
    e.stopImmediatePropagation();
    confirmDialog("¿Salir sin guardar? Se perderá lo que escribiste en este producto.", () => close());
  }, true);

  // ---------- guardar ----------
  function focusFirstProblem() {
    const target = overlay.querySelector(".modal-body .is-invalid");
    if (!target) return;
    const focusable = target.matches("input, select, textarea, button") ? target : target.querySelector("button, input");
    try { target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
    try { focusable?.focus({ preventScroll: true }); } catch {}
  }

  $("#p-save").addEventListener("click", async () => {
    const res = validateProductForm({
      name: nameInput.value,
      brand: brandHidden.value,
      price: priceInput.value,
      costPrice: costInput.value,
      minStock: minStockInput.value,
    });
    Object.keys(FIELD_IDS).forEach((key) => setMsg(key, res.errors[key] || ""));
    // v5.31.0: comisión propia → monto obligatorio
    const ownVal = parseDecimal(ownAmount.value);
    const ownBad = ownToggle.checked && !(ownVal > 0);
    ownMsg.hidden = !ownBad;
    ownMsg.textContent = ownBad ? "Pon cuánto gana por unidad" : "";
    ownAmount.classList.toggle("is-invalid", ownBad);
    if (ownBad && res.ok) { focusFirstProblem(); toast("Falta un dato: está marcado en rojo", "error"); return; }
    if (!res.ok) {
      focusFirstProblem();
      const n = Object.keys(res.errors).length;
      toast(n === 1 ? "Falta un dato: está marcado en rojo" : `Faltan ${n} datos: están marcados en rojo`, "error");
      return;
    }

    const v = res.values;
    const categoryId = catSelect.value || null;
    const imageUrl = imageInput.value.trim() || null;
    const data = {
      ...(p.id ? { id: p.id } : {}),
      name: v.name,
      brand: canonicalBrand(v.brand, brandList),
      sku: $("#p-sku").value.trim() || null,
      viscosity: viscInput.value.trim() || null,
      categoryId,
      categoryName: categories.find((c) => c.id === categoryId)?.name || null,
      salePrice: v.salePrice,
      minStock: v.minStock,
      costPrice: v.costPrice,
      // v5.31.0: comisión propia (si se marca). Sin marcar, el vendedor cobra por venta.
      ownVendorCommission: ownToggle.checked,
      ...(ownToggle.checked ? { vendorCommission: ownVal, vendorCommissionCurrency: $("#p-ownCurrency").value } : {}),
      // v5.30.0: comisiones y venta por caja ya no se editan aquí (se conservan
      // las que tenga el producto; la venta por caja está en «Venta mayorista").
      imageUrl,
      // La miniatura solo vale para la foto subida aquí (o la que ya tenía)
      thumbUrl: imageUrl && imageUrl === uploadedImageUrl ? uploadedThumbUrl : null,
      active: activeInput.checked,
    };

    // Estado de guardado + error real en pantalla (antes fallaba en silencio)
    const saveBtn = $("#p-save");
    const cancelBtn = $("#p-cancel");
    const saveHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.innerHTML = `<div class="spinner spinner-sm"></div> Guardando...`;
    try {
      await saveProduct(data);
      // v5.12.0: una marca nueva escrita aquí se añade sola a la lista de marcas
      if (!brandCtx.missingTable && brandCtx.brands && !registeredBrands.some((n) => normalizeKey(n) === normalizeKey(data.brand))) {
        try { await saveBrand({ name: data.brand, sortOrder: 100 }); } catch (err) { console.warn("[marca] no se añadió a la lista:", err); }
      }
      toast(isNew ? "Producto creado" : "Producto guardado", "success");
      close();
      onSaved();
    } catch (err) {
      console.error("Error al guardar producto:", err);
      toast("No se pudo guardar: " + (err?.message || "error desconocido"), "error", 6000);
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.innerHTML = saveHtml;
    }
  });

  // ---------- estado inicial ----------
  paintBrand();
  paintMoney();
  if (isNew) autoCategory();
  initialState = snapshot();
  return close;
}

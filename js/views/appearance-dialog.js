// =====================================================
// Diálogo «Apariencia del almacén» (v5.25.0)
// Color, fondo, tamaño de letra y vista del catálogo — se ve al momento.
// v5.33.0: paletas (fondo, tarjetas, casillas y textos con otro tono).
// =====================================================
import { getStore, applyTheme } from "../store.js";
import { showModal, icon, esc, toast } from "../ui.js";
import {
  ACCENTS, BACKGROUNDS, FONT_LABELS, CATALOG_VIEWS, DEFAULT_APPEARANCE, PALETTES, paletteSwatch,
  getAppearance, saveAppearance, applyAppearance, sellerSlotOf,
} from "../appearance.js";

const SAMPLE = [
  { name: "Energy Formula 10W-40", sub: "MANNOL · 4 L", price: "$22.00", stock: 12 },
  { name: "Grasa multiuso 400 g", sub: "MANNOL", price: "$7.00", stock: 3, flag: "Quedan 3" },
  { name: "Refrigerante G12+", sub: "Royal · 1 L", price: "$6.00", stock: 15 },
  { name: "Diesel Extra 15W-40", sub: "MANNOL · 5 L", price: "$30.00", stock: 6 },
];

export function openAppearanceDialog(warehouse, onSaved) {
  if (!warehouse) return;
  const store = getStore();
  // v5.32.2: con dos vendedores, la apariencia es de quien entró
  const user = store.getState().currentUser;
  const slot = sellerSlotOf(user);
  const who = slot ? (user?.sellerName || `Vendedor ${slot}`) : "";
  const original = getAppearance(warehouse.id, slot);
  let draft = { ...original };
  let saved = false;

  const preview = () => applyAppearance(draft, applyTheme, store.getState().theme);

  const body = () => `
    <div class="appearance-dialog">
      <p class="text-xs text-muted" style="margin:0">${who ? `Solo para <strong>${esc(who)}</strong> en ${esc(warehouse.name)} (el otro vendedor tiene la suya).` : `Solo para <strong>${esc(warehouse.name)}</strong> en este teléfono.`} Los cambios se ven al momento.</p>

      <!-- v5.33.0: paletas -->
      <div class="ap-group">
        <div class="ap-label">Paleta</div>
        <div class="ap-palettes" role="radiogroup" aria-label="Paleta">
          ${Object.entries(PALETTES).map(([k, pl]) => {
            const sw = paletteSwatch(k, document.documentElement.getAttribute("data-theme") === "dark");
            return `
            <button type="button" role="radio" class="ap-pal ${draft.palette === k ? "on" : ""}" data-ap="palette" data-v="${k}" aria-checked="${draft.palette === k}">
              <span class="ap-pal-mini" aria-hidden="true" style="background:${sw.page}">
                <span style="background:${sw.card};border-color:${sw.line}"><i style="background:${sw.text}"></i><i style="background:${sw.text};opacity:.45"></i><b></b></span>
              </span>
              <span class="ap-pal-label">${esc(pl.label)}</span>
            </button>`; }).join("")}
        </div>
      </div>

      <div class="ap-group">
        <div class="ap-label">Color de botones</div>
        <div class="ap-swatches">
          ${Object.entries(ACCENTS).map(([k, a]) => `
            <button type="button" class="ap-swatch ${draft.accent === k ? "on" : ""}" data-ap="accent" data-v="${k}" aria-pressed="${draft.accent === k}">
              <span class="ap-dot" style="background:${a.dark || "oklch(0.62 0.14 165)"}"></span>${esc(a.label)}
            </button>`).join("")}
        </div>
      </div>

      ${seg("Fondo", "background", BACKGROUNDS)}
      ${seg("Tamaño de letra", "font", FONT_LABELS)}

      <!-- v5.27.0: «Ver» como en Windows — cada opción muestra cómo queda el catálogo -->
      <div class="ap-group">
        <div class="ap-label">Ver el catálogo como</div>
        <div class="ap-views" role="radiogroup" aria-label="Ver el catálogo como">
          ${Object.entries(CATALOG_VIEWS).map(([k, l]) => `
            <button type="button" role="radio" class="ap-view ${draft.catalogView === k ? "on" : ""}" data-ap="catalogView" data-v="${k}" aria-checked="${draft.catalogView === k}">
              <span class="ap-mini ap-mini--${k}" aria-hidden="true">${miniTiles(k)}</span>
              <span class="ap-view-label">${esc(l)}</span>
            </button>`).join("")}
        </div>
      </div>

      <div class="ap-group">
        <div class="ap-label">Así se verá el catálogo</div>
        <div class="ap-preview">
          <div class="catalog-list ${draft.catalogView === "details" ? "" : `as-cards view-${draft.catalogView}`}" id="ap-preview-list">
            ${SAMPLE.map((p) => sampleItem(p, draft.catalogView)).join("")}
          </div>
        </div>
      </div>
    </div>`;

  // Miniatura esquemática de cada vista (cuadros = fotos, rayas = textos)
  function miniTiles(view) {
    const n = { xlarge: 1, large: 2, medium: 4, small: 9, details: 4 }[view] || 4;
    return Array.from({ length: n }, () => view === "details"
      ? `<i class="mr"><b></b><s></s></i>`
      : `<i class="mt"><b></b><s></s></i>`).join("");
  }
  // Producto de ejemplo pintado igual que en el catálogo de verdad
  function sampleItem(p, view) {
    if (view === "details") {
      return `
        <div class="catalog-item catalog-row">
          <div class="cr-pic">${icon("droplet", 18)}</div>
          <div class="cr-body"><div class="cr-name">${esc(p.name)}</div><div class="cr-meta">${esc(p.sub)} · Stock ${p.stock}</div></div>
          <div class="cr-price">${p.price}</div>
          <button type="button" class="btn btn-secondary btn-icon" tabindex="-1" aria-hidden="true">${icon("plus", 14)}</button>
        </div>`;
    }
    return `
      <div class="catalog-item catalog-tile">
        <div class="ct-pic">${icon("droplet", view === "small" ? 18 : 28)}${p.flag ? `<span class="ct-flag ct-stock">${esc(p.flag)}</span>` : ""}</div>
        <div class="ct-body"><div class="ct-name">${esc(p.name)}</div><div class="ct-sub">${esc(p.sub)}</div></div>
        <div class="ct-price">${p.price}</div>
        <button type="button" class="ct-add" tabindex="-1" aria-hidden="true">${view === "small" ? "+" : "+ Agregar"}</button>
      </div>`;
  }

  function seg(label, key, options) {
    return `
      <div class="ap-group">
        <div class="ap-label">${label}</div>
        <div class="ap-seg" role="group" aria-label="${esc(label)}">
          ${Object.entries(options).map(([k, l]) => `<button type="button" class="${draft[key] === k ? "on" : ""}" data-ap="${key}" data-v="${k}" aria-pressed="${draft[key] === k}">${esc(l)}</button>`).join("")}
        </div>
      </div>`;
  }

  const close = showModal({
    title: `${icon("palette", 16)} ${who ? `Apariencia de ${esc(who)}` : "Apariencia del almacén"}`,
    body: body(),
    footer: `
      <button class="btn btn-ghost" id="ap-reset">Restablecer</button>
      <button class="btn btn-outline" id="ap-cancel">Cancelar</button>
      <button class="btn btn-primary" id="ap-save">${icon("check", 14)} Guardar</button>`,
    onClose: () => { if (!saved) applyAppearance(original, applyTheme, store.getState().theme); },
  });

  const wire = () => {
    const root = document.querySelector(".appearance-dialog");
    if (!root) return;
    root.querySelectorAll("[data-ap]").forEach((b) => {
      b.addEventListener("click", () => {
        draft = { ...draft, [b.dataset.ap]: b.dataset.v };
        preview();
        root.outerHTML = body();
        wire();
      });
    });
  };
  wire();

  document.querySelector("#ap-cancel")?.addEventListener("click", () => close());
  document.querySelector("#ap-reset")?.addEventListener("click", () => {
    draft = { ...DEFAULT_APPEARANCE };
    preview();
    const root = document.querySelector(".appearance-dialog");
    if (root) { root.outerHTML = body(); wire(); }
  });
  document.querySelector("#ap-save")?.addEventListener("click", () => {
    saved = true;
    const n = saveAppearance(warehouse.id, draft, slot);
    applyAppearance(n, applyTheme, store.getState().theme);
    toast("Apariencia guardada para este almacén", "success");
    close();
    onSaved?.(n);
  });
}

// =====================================================
// Diálogo «Apariencia del almacén» (v5.25.0)
// Color, fondo, tamaño de letra y vista del catálogo — se ve al momento.
// =====================================================
import { getStore, applyTheme } from "../store.js";
import { showModal, icon, esc, toast } from "../ui.js";
import {
  ACCENTS, BACKGROUNDS, FONT_LABELS, CATALOG_VIEWS,
  getAppearance, saveAppearance, applyAppearance,
} from "../appearance.js";

export function openAppearanceDialog(warehouse, onSaved) {
  if (!warehouse) return;
  const store = getStore();
  const original = getAppearance(warehouse.id);
  let draft = { ...original };
  let saved = false;

  const preview = () => applyAppearance(draft, applyTheme, store.getState().theme);

  const body = () => `
    <div class="appearance-dialog">
      <p class="text-xs text-muted" style="margin:0">Solo para <strong>${esc(warehouse.name)}</strong> en este teléfono. Los cambios se ven al momento.</p>

      <div class="ap-group">
        <div class="ap-label">Color</div>
        <div class="ap-swatches">
          ${Object.entries(ACCENTS).map(([k, a]) => `
            <button type="button" class="ap-swatch ${draft.accent === k ? "on" : ""}" data-ap="accent" data-v="${k}" aria-pressed="${draft.accent === k}">
              <span class="ap-dot" style="background:${a.dark || "oklch(0.62 0.14 165)"}"></span>${esc(a.label)}
            </button>`).join("")}
        </div>
      </div>

      ${seg("Fondo", "background", BACKGROUNDS)}
      ${seg("Tamaño de letra", "font", FONT_LABELS)}
      ${seg("Catálogo de ventas", "catalogView", CATALOG_VIEWS)}

      <div class="ap-sample">
        <div class="ap-sample-card">
          <div class="ap-sample-pic">${icon("boxes", 22)}</div>
          <div style="min-width:0;flex:1">
            <div class="font-bold">MANNOL Energy 10W-40</div>
            <div class="text-xs text-muted">4 L · Stock 12</div>
          </div>
          <strong class="ap-sample-price">$22.00</strong>
        </div>
        <button type="button" class="btn btn-primary btn-sm btn-block" tabindex="-1">${icon("cart", 14)} Así se ven los botones</button>
      </div>
    </div>`;

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
    title: `${icon("palette", 16)} Apariencia del almacén`,
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
    draft = { accent: "mannol", background: "app", font: "md", catalogView: "list" };
    preview();
    const root = document.querySelector(".appearance-dialog");
    if (root) { root.outerHTML = body(); wire(); }
  });
  document.querySelector("#ap-save")?.addEventListener("click", () => {
    saved = true;
    const n = saveAppearance(warehouse.id, draft);
    applyAppearance(n, applyTheme, store.getState().theme);
    toast("Apariencia guardada para este almacén", "success");
    close();
    onSaved?.(n);
  });
}

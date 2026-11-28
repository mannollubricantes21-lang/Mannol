// =====================================================
// Global search — Cmd/Ctrl+K palette
// =====================================================
// Mounts a search modal that lets the user quickly navigate
// to any view, find a product, or find a sale by code.
//
// Usage:
//   import { setupGlobalSearch } from "./global-search.js";
//   setupGlobalSearch((view) => navigate(view));
// =====================================================

import { listProducts, listSales, listWarehouses } from "./db.js";
import { formatMoney, formatDate } from "./currency.js";
import { icon, escapeHtml, showModal } from "./ui.js";

let _installed = false;
let _cachedProducts = [];
let _cachedSales = [];
let _cachedWarehouses = [];
let _lastCache = 0;
const CACHE_TTL = 60000; // 1 min

async function refreshCache() {
  if (Date.now() - _lastCache < CACHE_TTL) return;
  _lastCache = Date.now();
  try {
    [_cachedProducts, _cachedSales, _cachedWarehouses] = await Promise.all([
      listProducts(),
      listSales({}),
      listWarehouses(),
    ]);
  } catch {
    // ignore — cache stays empty
  }
}

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "home", section: "Navegación" },
  { id: "sales", label: "Registrar venta", icon: "cart", section: "Navegación" },
  { id: "stock", label: "Inventario", icon: "boxes", section: "Navegación" },
  { id: "history", label: "Historial de ventas", icon: "receipt", section: "Navegación" },
  { id: "team-status", label: "Estado del equipo (ventas por subir)", icon: "activity", section: "Navegación" }, // v5.18.0
  { id: "managers", label: "Gestores", icon: "users", section: "Navegación" },
  { id: "catalog", label: "Catálogo", icon: "tags", section: "Navegación" },
  { id: "commissions", label: "Comisiones", icon: "wallet", section: "Navegación" },
  { id: "transfers", label: "Transferencias", icon: "creditCard", section: "Navegación" },
  { id: "users", label: "Usuarios", icon: "userCog", section: "Navegación" },
  { id: "settings", label: "Ajustes", icon: "settings", section: "Navegación" },
  { id: "admin", label: "Panel admin", icon: "shield", section: "Navegación" },
];

/**
 * Instala la paleta Ctrl+K.
 * @param {(id: string) => void} navigate - navega a una vista/sección
 * @param {Object} [opts] - { navItems?: Array, extraActions?: Array<{label, icon, sub?, run}> }
 *   navItems reemplaza la lista de vistas (p.ej. secciones del panel admin);
 *   extraActions añade acciones ejecutables al final de la búsqueda.
 */
export function setupGlobalSearch(navigate, opts = {}) {
  if (_installed) return;
  _installed = true;

  // Listen for Cmd/Ctrl+K
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch(navigate, opts);
    }
  });

  // Also expose a global function for manual trigger from a button
  window.__openGlobalSearch = () => openSearch(navigate, opts);
}

function openSearch(navigate, opts = {}) {
  refreshCache();
  const navList = Array.isArray(opts.navItems) && opts.navItems.length > 0 ? opts.navItems : NAV_ITEMS;

  // v5.39.6 (B3): dialog nativo del sistema vía showModal() de ui.js en vez
  // del overlay a mano con role="dialog" — trampa de foco, Escape y
  // restauración de foco los hace el navegador, igual que el resto de los
  // modales desde v5.39.4.
  const close = showModal({
    noHeader: true,
    ariaLabel: "Búsqueda global",
    align: "top",
    cardStyle: "max-width: 36rem; width: calc(100% - 1.5rem);",
    body: `
      <div style="display:flex;flex-direction:column;max-height:70vh">
        <div style="position:relative;display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-muted);flex-shrink:0" aria-hidden="true">${icon("search", 16)}</span>
          <input type="text" id="gs-input" placeholder="Buscar vistas, productos, ventas..." aria-label="Buscar vistas, productos y ventas" style="flex:1;min-width:0;padding:0.5rem 0;border:none;background:transparent;color:var(--text);font-size:0.9375rem;outline:none" />
          <button class="btn btn-ghost btn-icon gs-close" aria-label="Cerrar" type="button">✕</button>
        </div>
        <div id="gs-results" style="overflow-y:auto;flex:1;min-height:0;padding:0.5rem"></div>
        <div style="padding:0.5rem 0.75rem;border-top:1px solid var(--border);font-size:0.6875rem;color:var(--text-muted)">
          <kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>Enter</kbd> seleccionar · <kbd>Esc</kbd> cerrar
        </div>
      </div>
    `,
  });
  const container = document.getElementById("modal-container");
  const dlg = container?.querySelector("dialog.modal-overlay:last-of-type");
  const input = dlg?.querySelector("#gs-input");
  const results = dlg?.querySelector("#gs-results");
  if (!dlg || !input || !results) return;
  dlg.querySelector(".gs-close")?.addEventListener("click", close);

  let selectedIdx = 0;
  let currentResults = [];

  function render(q) {
    q = (q || "").toLowerCase().trim();
    const groups = [];

    // Group 1: Navigation (+ acciones rápidas si el panel las define)
    const actions = (opts.extraActions || [])
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({ type: "action", label: a.label, sub: a.sub || "Acción", icon: a.icon || "arrowRight", run: a.run }));
    const navMatches = navList.filter((n) => !q || n.label.toLowerCase().includes(q)).slice(0, 5);
    const navItems = [
      ...actions,
      ...navMatches.map((n) => ({ type: "nav", id: n.id, label: n.label, sub: n.sub || "Vista", icon: n.icon })),
    ];
    if (navItems.length > 0) {
      groups.push({ section: "Navegación", items: navItems });
    }

    // Group 2: Products
    if (q && q.length >= 2) {
      const prodMatches = _cachedProducts
        .filter((p) => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q))
        .slice(0, 5);
      if (prodMatches.length > 0) {
        groups.push({ section: "Productos", items: prodMatches.map((p) => ({ type: "product", id: p.id, label: p.name, sub: `${p.brand} · ${p.sku || "sin SKU"} · ${formatMoney(p.salePrice, "USD")}`, icon: "tags" })) });
      }
    }

    // Group 3: Sales
    if (q && q.length >= 2) {
      const saleMatches = _cachedSales
        .filter((s) => (s.code || "").toLowerCase().includes(q) || (s.customerName || "").toLowerCase().includes(q))
        .slice(0, 5);
      if (saleMatches.length > 0) {
        groups.push({ section: "Ventas", items: saleMatches.map((s) => ({ type: "sale", id: s.id, label: s.code, sub: `${formatMoney(s.totalAmount, "USD")} · ${formatDate(s.createdAt, { day: "numeric", month: "short", year: "numeric" })} · ${s.status}`, icon: "receipt" })) });
      }
    }

    // Group 4: Warehouses
    if (q && q.length >= 2) {
      const whMatches = _cachedWarehouses
        .filter((w) => w.name.toLowerCase().includes(q) || (w.code || "").toLowerCase().includes(q))
        .slice(0, 3);
      if (whMatches.length > 0) {
        groups.push({ section: "Almacenes", items: whMatches.map((w) => ({ type: "warehouse", id: w.id, label: w.name, sub: `Código: ${w.code}`, icon: "building" })) });
      }
    }

    currentResults = groups.flatMap((g) => g.items);
    selectedIdx = 0;

    if (currentResults.length === 0) {
      results.innerHTML = `<div class="empty-state" style="padding: 2rem;"><div class="empty-state-icon">${icon("search", 24)}</div><p class="empty-state-title">Sin resultados</p><p class="empty-state-desc">${q ? `No se encontró nada para "${escapeHtml(q)}"` : "Escribe para buscar vistas, productos, ventas o almacenes"}</p></div>`;
      return;
    }

    let html = "";
    let idx = 0;
    for (const group of groups) {
      html += `<div style="padding: 0.25rem 0.5rem; font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem;">${group.section}</div>`;
      for (const item of group.items) {
        html += `<button class="gs-item" data-idx="${idx}" style="display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.5rem 0.75rem; border: none; background: transparent; color: var(--text); text-align: left; cursor: pointer; border-radius: var(--radius); ${idx === selectedIdx ? "background: var(--bg-soft);" : ""}">
          <span style="color: var(--text-muted); flex-shrink: 0;">${icon(item.icon, 16)}</span>
          <span style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; font-size: 0.875rem;">${escapeHtml(item.label)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.sub)}</div>
          </span>
          ${item.type === "nav" ? `<span style="font-size: 0.625rem; color: var(--text-muted);">${icon("arrowRight", 12)}</span>` : ""}
        </button>`;
        idx++;
      }
    }
    results.innerHTML = html;

    // Wire up clicks
    results.querySelectorAll(".gs-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.idx);
        selectResult(currentResults[i], navigate, close);
      });
      btn.addEventListener("mouseenter", () => {
        selectedIdx = parseInt(btn.dataset.idx);
        updateSelected();
      });
    });
  }

  function updateSelected() {
    results.querySelectorAll(".gs-item").forEach((btn, i) => {
      btn.style.background = i === selectedIdx ? "var(--bg-soft)" : "transparent";
    });
  }

  input.addEventListener("input", (e) => render(e.target.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, currentResults.length - 1);
      updateSelected();
      // Scroll into view
      const el = results.querySelector(`.gs-item[data-idx="${selectedIdx}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      updateSelected();
      const el = results.querySelector(`.gs-item[data-idx="${selectedIdx}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentResults[selectedIdx]) {
        selectResult(currentResults[selectedIdx], navigate, close);
      }
    } else if (e.key === "Escape") {
      close(); // dialog nativo: el navegador ya cerró; en jsdom lo cierra showModal
    }
  });

  // Primer render con la navegación base (el foco lo puso showModal)
  render("");
}

function selectResult(item, navigate, close) {
  close();
  if (item.type === "action") {
    item.run?.();
  } else if (item.type === "nav") {
    navigate(item.id);
  } else if (item.type === "product") {
    navigate("catalog");
  } else if (item.type === "sale") {
    navigate("history");
  } else if (item.type === "warehouse") {
    navigate("stock");
  }
}

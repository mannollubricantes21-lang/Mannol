// =====================================================
// Apariencia por almacén (v5.25.0)
// =====================================================
// Cada almacén puede tener su color, su fondo (claro / oscuro), su tamaño de
// letra y la vista del catálogo (lista compacta o tarjetas). Se guarda en este
// equipo (localStorage), por almacén: no necesita cambios en Supabase.
// =====================================================

const KEY = (whId) => `mannol-appearance-${whId}`;

/** Colores disponibles. light / dark: color principal según el fondo. */
export const ACCENTS = {
  mannol:  { label: "Verde MANNOL", light: null,      dark: null,      fgLight: null,      fgDark: null },
  dorado:  { label: "Dorado",       light: "#a87400", dark: "#f5b800", fgLight: "#ffffff", fgDark: "#1a1200" },
  azul:    { label: "Azul",         light: "#1d5fd1", dark: "#60a5fa", fgLight: "#ffffff", fgDark: "#071a33" },
  rojo:    { label: "Rojo",         light: "#c0262d", dark: "#f87171", fgLight: "#ffffff", fgDark: "#2a0707" },
  violeta: { label: "Violeta",      light: "#6d3fd6", dark: "#a78bfa", fgLight: "#ffffff", fgDark: "#160b33" },
  naranja: { label: "Naranja",      light: "#b9480f", dark: "#fb923c", fgLight: "#ffffff", fgDark: "#2a1003" },
};
export const FONT_SCALES = { sm: 0.92, md: 1, lg: 1.1, xl: 1.22 };
export const FONT_LABELS = { sm: "Pequeña", md: "Normal", lg: "Grande", xl: "Muy grande" };
export const BACKGROUNDS = { app: "Como la app", dark: "Oscuro", light: "Claro" };
export const CATALOG_VIEWS = { list: "Lista compacta", cards: "Tarjetas" };

export const DEFAULT_APPEARANCE = { accent: "mannol", background: "app", font: "md", catalogView: "list" };

/** Devuelve una apariencia válida (descarta valores desconocidos). */
export function normalizeAppearance(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  return {
    accent: ACCENTS[a.accent] ? a.accent : DEFAULT_APPEARANCE.accent,
    background: BACKGROUNDS[a.background] ? a.background : DEFAULT_APPEARANCE.background,
    font: FONT_SCALES[a.font] ? a.font : DEFAULT_APPEARANCE.font,
    catalogView: CATALOG_VIEWS[a.catalogView] ? a.catalogView : DEFAULT_APPEARANCE.catalogView,
  };
}

export function getAppearance(whId) {
  if (!whId) return { ...DEFAULT_APPEARANCE };
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(KEY(whId)) || "null")); } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function saveAppearance(whId, a) {
  const n = normalizeAppearance(a);
  try { if (whId) localStorage.setItem(KEY(whId), JSON.stringify(n)); } catch {}
  return n;
}

/**
 * Variables CSS para un color y un fondo (puro, testeado).
 * @returns {Record<string,string>} vacío si es el verde de siempre
 */
export function accentVars(accent, isDark) {
  const a = ACCENTS[accent];
  if (!a || !a.light) return {};
  const c = isDark ? a.dark : a.light;
  const fg = isDark ? a.fgDark : a.fgLight;
  return {
    "--primary": c,
    "--primary-hover": `color-mix(in oklab, ${c} 85%, ${isDark ? "white" : "black"})`,
    "--primary-foreground": fg,
    "--primary-soft": `color-mix(in oklab, ${c} ${isDark ? 22 : 12}%, transparent)`,
    "--primary-tint": `color-mix(in oklab, ${c} ${isDark ? 16 : 10}%, transparent)`,
  };
}

const VAR_NAMES = ["--primary", "--primary-hover", "--primary-foreground", "--primary-soft", "--primary-tint"];
let baseTheme = null; // el tema de la app (claro / oscuro / sistema) para restaurarlo

/**
 * Aplica la apariencia a la página. `null` = volver a la de la app.
 * @param {Object|null} appearance
 * @param {(theme:string) => void} applyTheme  función del store
 * @param {string} appTheme  tema elegido en la app ("light" | "dark" | "system")
 */
export function applyAppearance(appearance, applyTheme, appTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const a = appearance ? normalizeAppearance(appearance) : null;
  baseTheme = appTheme || baseTheme || "system";
  // Fondo
  const theme = a && a.background !== "app" ? a.background : baseTheme;
  try { applyTheme?.(theme); } catch {}
  const isDark = root.getAttribute("data-theme") === "dark";
  // Color
  VAR_NAMES.forEach((v) => root.style.removeProperty(v));
  if (a) Object.entries(accentVars(a.accent, isDark)).forEach(([k, v]) => root.style.setProperty(k, v));
  // Letra (todo el diseño usa rem: escala junto)
  const scale = a ? FONT_SCALES[a.font] : 1;
  if (scale && scale !== 1) {
    root.style.fontSize = `${Math.round(16 * scale * 100) / 100}px`;
    root.setAttribute("data-font-scale", a.font);
  } else {
    root.style.removeProperty("font-size");
    root.removeAttribute("data-font-scale");
  }
  // Vista del catálogo
  root.setAttribute("data-catalog-view", a ? a.catalogView : "list");
  root.setAttribute("data-accent", a ? a.accent : "mannol");
}

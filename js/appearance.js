// =====================================================
// Apariencia por almacén (v5.25.0)
// =====================================================
// Cada almacén puede tener su color, su fondo (claro / oscuro), su tamaño de
// letra y la vista del catálogo (lista compacta o tarjetas). Se guarda en este
// equipo (localStorage), por almacén: no necesita cambios en Supabase.
// v5.32.2: en almacenes con dos vendedores, cada vendedor tiene la suya.
// =====================================================

// v5.32.2: con dos vendedores, cada uno guarda la suya (…-s1 / …-s2)
const KEY = (whId, slot) => (slot ? `mannol-appearance-${whId}-s${slot}` : `mannol-appearance-${whId}`);

/** Vendedor 1 o 2 del almacén (null si el almacén tiene uno solo). */
export const sellerSlotOf = (user) => (user?.sellerSlot === 1 || user?.sellerSlot === 2 ? user.sellerSlot : null);

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
// v5.27.0: vistas al estilo del menú «Ver» de Windows (de más grande a detalles)
export const CATALOG_VIEWS = {
  xlarge: "Iconos muy grandes",
  large: "Iconos grandes",
  medium: "Iconos medianos",
  small: "Iconos pequeños",
  details: "Detalles",
};
// Nombres de antes (v5.25–v5.26) → los de ahora
const LEGACY_VIEWS = { list: "details", cards: "medium" };
/** ¿La vista del catálogo es de iconos (rejilla) o de detalles (lista)? */
export const isIconView = (v) => v === "xlarge" || v === "large" || v === "medium" || v === "small";

// v5.33.0: paletas — cambian fondo, tarjetas, casillas, bordes y textos
// (no solo el color de los botones). h = tono, c = cuánto color.
export const PALETTES = {
  normal:    { label: "Normal" },
  arena:     { label: "Arena",          h: 75,  c: 0.032 },
  oceano:    { label: "Océano",         h: 235, c: 0.036 },
  bosque:    { label: "Bosque",         h: 155, c: 0.034 },
  lavanda:   { label: "Lavanda",        h: 295, c: 0.036 },
  coral:     { label: "Coral",          h: 28,  c: 0.032 },
  grafito:   { label: "Grafito",        h: 260, c: 0.006 },
  contraste: { label: "Alto contraste", contrast: true },
};

export const DEFAULT_APPEARANCE = { accent: "mannol", background: "app", font: "md", catalogView: "details", palette: "normal" };

/** Devuelve una apariencia válida (descarta valores desconocidos). */
export function normalizeAppearance(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  return {
    accent: ACCENTS[a.accent] ? a.accent : DEFAULT_APPEARANCE.accent,
    background: BACKGROUNDS[a.background] ? a.background : DEFAULT_APPEARANCE.background,
    font: FONT_SCALES[a.font] ? a.font : DEFAULT_APPEARANCE.font,
    catalogView: CATALOG_VIEWS[a.catalogView] ? a.catalogView
      : LEGACY_VIEWS[a.catalogView] || DEFAULT_APPEARANCE.catalogView,
    palette: PALETTES[a.palette] ? a.palette : DEFAULT_APPEARANCE.palette,
  };
}

/**
 * Apariencia del almacén; con `slot` (1/2), la de ese vendedor. Si el vendedor
 * aún no eligió la suya, parte de la que tenía el almacén.
 */
export function getAppearance(whId, slot = null) {
  if (!whId) return { ...DEFAULT_APPEARANCE };
  try {
    const own = slot ? localStorage.getItem(KEY(whId, slot)) : null;
    return normalizeAppearance(JSON.parse(own || localStorage.getItem(KEY(whId)) || "null"));
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function saveAppearance(whId, a, slot = null) {
  const n = normalizeAppearance(a);
  try { if (whId) localStorage.setItem(KEY(whId, slot), JSON.stringify(n)); } catch {}
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

const ok = (l, c, h, a) => `oklch(${l} ${Math.round(c * 1000) / 1000} ${h}${a !== undefined ? ` / ${a}` : ""})`;

/**
 * Variables de superficie de una paleta (fondo de página, tarjetas, casillas,
 * bordes y textos) para el fondo claro u oscuro. Vacío = la de la app.
 * @returns {Record<string,string>}
 */
export function paletteVars(palette, isDark) {
  const p = PALETTES[palette];
  if (!p || palette === "normal") return {};
  if (p.contrast) {
    return isDark ? {
      "--bg": "#000", "--page-bg": "#000", "--bg-soft": ok(0.2, 0, 0), "--bg-elevated": ok(0.16, 0, 0), "--bg-dark": "#000",
      "--tile-bg": ok(0.22, 0, 0), "--cell-bg": ok(0.12, 0, 0), "--card-head": ok(0.22, 0, 0),
      "--text": "#fff", "--text-soft": ok(0.92, 0, 0), "--text-muted": ok(0.84, 0, 0),
      "--border": "oklch(1 0 0 / 45%)", "--border-strong": "oklch(1 0 0 / 70%)", "--card-line": ok(0.6, 0, 0),
      "--tile-border": ok(0.5, 0, 0), "--input-border": ok(0.7, 0, 0), "--btn-line-s": ok(0.6, 0, 0),
      "--hero-top": ok(0.16, 0, 0), "--hero-bot": ok(0.16, 0, 0), "--hero-line": "#fff",
    } : {
      "--bg": ok(0.97, 0, 0), "--page-bg": ok(0.97, 0, 0), "--bg-soft": ok(0.93, 0, 0), "--bg-elevated": "#fff", "--bg-dark": "#000",
      "--tile-bg": "#fff", "--cell-bg": ok(0.96, 0, 0), "--card-head": ok(0.94, 0, 0),
      "--text": "#000", "--text-soft": ok(0.22, 0, 0), "--text-muted": ok(0.34, 0, 0),
      "--border": ok(0.45, 0, 0), "--border-strong": ok(0.25, 0, 0), "--card-line": ok(0.4, 0, 0),
      "--tile-border": ok(0.5, 0, 0), "--input-border": ok(0.35, 0, 0), "--btn-line-s": ok(0.45, 0, 0),
      "--hero-top": "#000", "--hero-bot": "#000", "--hero-line": "#000",
    };
  }
  const { h, c } = p;
  return isDark ? {
    "--bg": ok(0.15, c * 0.9, h), "--page-bg": ok(0.15, c * 0.9, h), "--bg-soft": ok(0.25, c, h),
    "--bg-elevated": ok(0.215, c, h), "--bg-dark": ok(0.11, c * 0.8, h),
    "--tile-bg": ok(0.26, c, h), "--cell-bg": ok(0.19, c * 0.9, h), "--card-head": ok(0.24, c, h),
    "--text": ok(0.96, c * 0.25, h), "--text-soft": ok(0.83, c * 0.5, h), "--text-muted": ok(0.71, c * 0.6, h),
    "--card-line": ok(0.33, c, h), "--tile-border": ok(0.31, c, h), "--btn-line-s": ok(0.39, c, h),
    "--hero-top": ok(0.27, c * 2, h), "--hero-bot": ok(0.2, c * 1.8, h), "--hero-line": ok(0.12, c * 1.5, h),
  } : {
    "--bg": ok(0.935, c, h), "--page-bg": ok(0.935, c, h), "--bg-soft": ok(0.955, c * 0.8, h),
    "--bg-elevated": ok(0.99, c * 0.35, h), "--bg-dark": ok(0.2, c * 1.2, h),
    "--tile-bg": ok(0.97, c * 0.55, h), "--cell-bg": ok(0.968, c * 0.6, h), "--card-head": ok(0.96, c * 0.7, h),
    "--text": ok(0.2, c * 0.8, h), "--text-soft": ok(0.38, c, h), "--text-muted": ok(0.48, c, h),
    "--border": ok(0.84, c, h), "--border-strong": ok(0.7, c, h), "--card-line": ok(0.83, c, h),
    "--tile-border": ok(0.85, c, h), "--input-border": ok(0.78, c, h), "--btn-line-s": ok(0.79, c, h),
    "--hero-top": ok(0.27, c * 2.2, h), "--hero-bot": ok(0.2, c * 2, h), "--hero-line": ok(0.13, c * 1.6, h),
  };
}
const PALETTE_VAR_NAMES = [...new Set(["normal", ...Object.keys(PALETTES)].flatMap((k) => [...Object.keys(paletteVars(k, true)), ...Object.keys(paletteVars(k, false))]))];

/** 3 colores para la muestra de la paleta: página, tarjeta, texto. */
export function paletteSwatch(palette, isDark) {
  const v = paletteVars(palette, isDark);
  return {
    page: v["--bg"] || (isDark ? "oklch(0.14 0.012 220)" : "oklch(0.945 0.008 220)"),
    card: v["--bg-elevated"] || (isDark ? "oklch(0.212 0.018 220)" : "#fff"),
    text: v["--text"] || (isDark ? "oklch(0.96 0.005 220)" : "oklch(0.18 0.02 220)"),
    line: v["--card-line"] || (isDark ? "oklch(0.32 0.015 220)" : "oklch(0.85 0.012 220)"),
  };
}
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
  // Paleta (superficies y textos)
  PALETTE_VAR_NAMES.forEach((v) => root.style.removeProperty(v));
  if (a) Object.entries(paletteVars(a.palette, isDark)).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute("data-palette", a ? a.palette : "normal");
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
  root.setAttribute("data-catalog-view", a ? a.catalogView : "details");
  root.setAttribute("data-accent", a ? a.accent : "mannol");
}

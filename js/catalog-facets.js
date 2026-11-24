// =====================================================
// v5.12.0 — Tipos (categorías) y marcas del catálogo de venta
// =====================================================
// Funciones puras (sin DOM ni red) para:
//  - los tipos y marcas por defecto que pidió el negocio,
//  - comparar nombres sin importar mayúsculas, tildes ni plurales,
//  - armar los filtros (chips) del catálogo con sus contadores,
//  - filtrar productos por tipo + marca + búsqueda,
//  - sugerir el tipo y la marca de un producto (Admin → Organizar).
// =====================================================

/** Tipos de producto por defecto (se crean como categorías raíz). */
export const DEFAULT_CATEGORY_TYPES = [
  { name: "Refrigerante",     slug: "refrigerante",     icon: "❄️", color: "cyan",    sortOrder: 1 },
  { name: "Líquido de freno", slug: "liquido-de-freno", icon: "🛑", color: "rose",    sortOrder: 2 },
  { name: "Filtros",          slug: "filtros",          icon: "🔧", color: "blue",    sortOrder: 3 },
  { name: "Lubricantes",      slug: "lubricantes",      icon: "🛢️", color: "emerald", sortOrder: 4 },
  { name: "Aditivos",         slug: "aditivos",         icon: "🧪", color: "violet",  sortOrder: 5 },
];

/** Marcas por defecto. */
export const DEFAULT_BRANDS = [
  { name: "MANNOL", slug: "mannol", sortOrder: 1 },
  { name: "Royal",  slug: "royal",  sortOrder: 2 },
];

/** Valor especial del filtro de tipo: productos sin categoría. */
export const NO_CATEGORY = "__none__";

// ---------- Normalización de nombres ----------

/** minúsculas, sin tildes, espacios simples: "  Líquido  de FRENO " → "liquido de freno" */
export function normalizeKey(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Como normalizeKey, pero tolera plurales: "Líquidos de frenos" ≡ "Líquido de freno". */
export function looseKey(s) {
  return normalizeKey(s)
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

/** "Líquido de freno" → "liquido-de-freno" */
export function slugify(s) {
  return normalizeKey(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---------- Marcas ----------

/**
 * Devuelve el nombre "oficial" de una marca si ya existe en la lista
 * (sin importar mayúsculas/tildes): "mannol " → "MANNOL". Si es nueva,
 * devuelve el texto escrito (sin espacios de más).
 */
export function canonicalBrand(input, brandNames = []) {
  const typed = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!typed) return "";
  const key = normalizeKey(typed);
  const hit = brandNames.find((b) => normalizeKey(b) === key);
  if (hit) return hit;
  // Marca nueva escrita toda en minúsculas (teclado del teléfono): "castrol" → "Castrol".
  // Si trae mayúsculas ("ELF", "MANNOL") se respeta como está.
  return typed === typed.toLowerCase()
    ? typed.replace(/(^|[\s\-/])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
    : typed;
}

/** Nombres de marcas: las registradas (en su orden) + las que usan los productos y faltan. */
export function knownBrandNames(brands = [], products = []) {
  const out = [];
  const seen = new Set();
  const push = (name) => {
    const k = normalizeKey(name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(String(name).trim());
  };
  sortBrands(brands).filter((b) => b.active !== false).forEach((b) => push(b.name));
  products
    .map((p) => (p.brand || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach(push);
  return out;
}

export function sortBrands(brands = []) {
  return [...brands].sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), "es"));
}

// ---------- Categorías ----------

export function sortCategories(categories = []) {
  return [...categories].sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), "es"));
}

/** Índices para ubicar rápido la categoría de un producto. */
export function indexCategories(categories = []) {
  const byId = new Map();
  const byKey = new Map();
  for (const c of categories) {
    byId.set(c.id, c);
    const k = looseKey(c.name);
    if (k && !byKey.has(k)) byKey.set(k, c);
  }
  return { byId, byKey };
}

/**
 * Id de la categoría RAÍZ de un producto (las subcategorías cuentan para su
 * categoría principal). Si el producto solo trae el nombre (datos viejos), se
 * busca por nombre. Devuelve null si no tiene categoría válida.
 */
export function topCategoryId(product, index) {
  if (!product) return null;
  let c = product.categoryId ? index.byId.get(product.categoryId) : null;
  if (!c && product.categoryName) c = index.byKey.get(looseKey(product.categoryName)) || null;
  for (let i = 0; c && c.parentId && i < 6; i++) {
    const parent = index.byId.get(c.parentId);
    if (!parent) break;
    c = parent;
  }
  return c ? c.id : null;
}

/** Tipos por defecto que todavía no existen (compara sin tildes ni plurales). */
export function missingDefaultTypes(categories = []) {
  const existing = new Set(
    categories.filter((c) => !c.parentId).flatMap((c) => [looseKey(c.name), looseKey(c.slug || "")]),
  );
  return DEFAULT_CATEGORY_TYPES.filter((t) => !existing.has(looseKey(t.name)) && !existing.has(looseKey(t.slug)));
}

/** Marcas por defecto que todavía no están en la lista. */
export function missingDefaultBrands(brands = []) {
  const existing = new Set(brands.map((b) => normalizeKey(b.name)));
  return DEFAULT_BRANDS.filter((b) => !existing.has(normalizeKey(b.name)));
}

// ---------- Filtros del catálogo (chips) ----------

/**
 * Arma los chips de "Tipo" y "Marca" con sus contadores.
 * - Solo aparecen tipos/marcas con al menos 1 producto (no hay filtros vacíos).
 * - `count` = productos en total; `countHere` = productos que quedan con el
 *   OTRO filtro aplicado (p. ej. cuántos "Filtros" hay de la marca elegida).
 * @returns {{ categories: Array, uncategorized: {count:number,countHere:number},
 *             brands: Array, total: number }}
 */
export function buildCatalogFacets(products = [], categories = [], brands = [], selected = {}) {
  const index = indexCategories(categories);
  const brandList = knownBrandNames(brands, products);
  const selCat = selected.categoryId || "";
  const selBrand = selected.brandKey || "";

  const catCount = new Map();
  const catCountHere = new Map();
  const brandCount = new Map();
  const brandCountHere = new Map();
  let none = 0;
  let noneHere = 0;

  for (const p of products) {
    const cid = topCategoryId(p, index);
    const bkey = normalizeKey(p.brand);
    const inBrand = !selBrand || bkey === selBrand;
    const inCat = !selCat || (selCat === NO_CATEGORY ? !cid : cid === selCat);
    if (cid) {
      catCount.set(cid, (catCount.get(cid) || 0) + 1);
      if (inBrand) catCountHere.set(cid, (catCountHere.get(cid) || 0) + 1);
    } else {
      none++;
      if (inBrand) noneHere++;
    }
    if (bkey) {
      brandCount.set(bkey, (brandCount.get(bkey) || 0) + 1);
      if (inCat) brandCountHere.set(bkey, (brandCountHere.get(bkey) || 0) + 1);
    }
  }

  const cats = sortCategories(categories.filter((c) => !c.parentId && c.active !== false))
    .filter((c) => catCount.get(c.id))
    .map((c) => ({
      id: c.id, name: c.name, icon: c.icon || "", color: c.color || "slate",
      count: catCount.get(c.id) || 0, countHere: catCountHere.get(c.id) || 0,
    }));

  const brandRows = brandList
    .map((name) => {
      const key = normalizeKey(name);
      return { key, name, count: brandCount.get(key) || 0, countHere: brandCountHere.get(key) || 0 };
    })
    .filter((b) => b.count > 0);

  return { categories: cats, uncategorized: { count: none, countHere: noneHere }, brands: brandRows, total: products.length };
}

/** Texto del producto en el que busca el buscador del catálogo. */
function haystack(p) {
  return normalizeKey([p.name, p.brand, p.sku, p.viscosity, p.categoryName].filter(Boolean).join(" "));
}

/**
 * Filtra por tipo (id de categoría raíz, NO_CATEGORY o ""), marca (clave
 * normalizada o "") y búsqueda (todas las palabras deben aparecer).
 */
export function filterCatalog(products = [], categories = [], { categoryId = "", brandKey = "", search = "" } = {}) {
  const index = indexCategories(categories);
  const words = normalizeKey(search).split(" ").filter(Boolean);
  return products.filter((p) => {
    if (categoryId) {
      const cid = topCategoryId(p, index);
      if (categoryId === NO_CATEGORY ? cid : cid !== categoryId) return false;
    }
    if (brandKey && normalizeKey(p.brand) !== brandKey) return false;
    if (words.length) {
      const h = haystack(p);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
}

// ---------- Sugerencias (Admin → Organizar productos) ----------

// El orden importa: "Filtro de aceite" es un filtro (no un lubricante) y
// "Aditivo para aceite" es un aditivo.
const TYPE_RULES = [
  { slug: "filtros",          re: /\bfiltro|\bfilter/ },
  { slug: "liquido-de-freno", re: /\bfreno|\bbrake|\bdot ?[345]\b/ },
  { slug: "refrigerante",     re: /refrigerante|anticongelante|antifreeze|coolant|radiador/ },
  { slug: "aditivos",         re: /aditivo|additive|limpia ?inyector|injector|stop ?fuga|tratamiento|octan|booster/ },
  { slug: "lubricantes",      re: /\baceite|\boil\b|lubricante|\bgrasa|\bgrease|\batf\b|transmision|hidraulic|\b\d{1,2} ?w[ -]?\d{2}\b/ },
];

// Nombres que también cuentan como ese tipo si el admin ya tenía categorías.
const TYPE_SYNONYMS = {
  "filtros": ["filtro"],
  "liquido-de-freno": ["liquido de freno", "freno", "liquido para freno"],
  "refrigerante": ["refrigerante", "anticongelante", "refrigerante y anticongelante"],
  "aditivos": ["aditivo"],
  "lubricantes": ["lubricante", "aceite", "aceite de motor", "aceite y lubricante"],
};

/** Busca la categoría (raíz) que corresponde a un tipo por defecto. */
export function findCategoryForType(slug, categories = []) {
  const type = DEFAULT_CATEGORY_TYPES.find((t) => t.slug === slug);
  if (!type) return null;
  const roots = sortCategories(categories.filter((c) => !c.parentId && c.active !== false));
  const exact = roots.find((c) => looseKey(c.name) === looseKey(type.name) || c.slug === type.slug);
  if (exact) return exact;
  const syn = new Set((TYPE_SYNONYMS[slug] || []).map(looseKey));
  return roots.find((c) => syn.has(looseKey(c.name))) || null;
}

/** Id de la categoría sugerida para un producto (o null si no se reconoce). */
export function suggestCategoryId(product, categories = []) {
  const text = normalizeKey([product?.name, product?.viscosity, product?.description].filter(Boolean).join(" "));
  if (!text) return null;
  for (const rule of TYPE_RULES) {
    if (rule.re.test(text)) {
      const cat = findCategoryForType(rule.slug, categories);
      if (cat) return cat.id;
    }
  }
  if (product?.viscosity) {
    const cat = findCategoryForType("lubricantes", categories);
    if (cat) return cat.id;
  }
  return null;
}

/** Marca sugerida: la del producto en su forma oficial, o la que aparece en el nombre. */
export function suggestBrand(product, brandNames = []) {
  const own = canonicalBrand(product?.brand, brandNames);
  if (own && brandNames.some((b) => b === own)) return own;
  const name = ` ${normalizeKey(product?.name)} `;
  const hit = brandNames.find((b) => {
    const k = normalizeKey(b);
    return k && name.includes(` ${k} `);
  });
  return hit || own || "";
}

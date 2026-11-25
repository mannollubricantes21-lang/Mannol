// v5.12.0 — Tipos y marcas del catálogo de venta
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATEGORY_TYPES, DEFAULT_BRANDS, NO_CATEGORY,
  normalizeKey, looseKey, slugify, canonicalBrand, knownBrandNames,
  topCategoryId, indexCategories, missingDefaultTypes, missingDefaultBrands,
  buildCatalogFacets, filterCatalog, findCategoryForType, suggestCategoryId, suggestBrand,
} from "../js/catalog-facets.js";

const CATS = [
  { id: "c-ref", name: "Refrigerante", slug: "refrigerante", icon: "❄️", sortOrder: 1, parentId: null },
  { id: "c-fre", name: "Líquido de freno", slug: "liquido-de-freno", icon: "🛑", sortOrder: 2, parentId: null },
  { id: "c-fil", name: "Filtros", slug: "filtros", sortOrder: 3, parentId: null },
  { id: "c-fil-a", name: "Aceite", slug: "aceite", sortOrder: 1, parentId: "c-fil" },
  { id: "c-lub", name: "Lubricantes", slug: "lubricantes", sortOrder: 4, parentId: null },
  { id: "c-lub-s", name: "Sintéticos", slug: "sinteticos", sortOrder: 1, parentId: "c-lub" },
  { id: "c-adi", name: "Aditivos", slug: "aditivos", sortOrder: 5, parentId: null },
  { id: "c-vac", name: "Vacía", slug: "vacia", sortOrder: 6, parentId: null },
];
const PRODUCTS = [
  { id: "p1", name: "MANNOL Energy Formula 5W-30", brand: "MANNOL", categoryId: "c-lub-s", viscosity: "5W-30" },
  { id: "p2", name: "Filtro de Aceite Mannol W712/93", brand: "mannol", categoryId: "c-fil-a" },
  { id: "p3", name: "Royal Refrigerante Verde 1L", brand: "Royal", categoryId: "c-ref" },
  { id: "p4", name: "Royal Líquido de Frenos DOT 3", brand: "ROYAL ", categoryId: "c-fre" },
  { id: "p5", name: "Grasa Multiuso", brand: "MANNOL", categoryId: null, categoryName: "Lubricantes" },
  { id: "p6", name: "Limpiaparabrisas", brand: "Castrol", categoryId: null },
];

describe("normalización de nombres", () => {
  it("ignora mayúsculas, tildes y espacios", () => {
    expect(normalizeKey("  Líquido  de FRENO ")).toBe("liquido de freno");
  });
  it("tolera plurales", () => {
    expect(looseKey("Líquidos de frenos")).toBe(looseKey("Líquido de freno"));
    expect(looseKey("Filtros")).toBe(looseKey("filtro"));
    expect(looseKey("Gas")).toBe("gas"); // palabras cortas no se tocan
  });
  it("slug", () => {
    expect(slugify("Líquido de freno")).toBe("liquido-de-freno");
    expect(slugify("  Royal / Pro ")).toBe("royal-pro");
  });
});

describe("marcas", () => {
  it("usa el nombre oficial si la marca ya existe", () => {
    expect(canonicalBrand(" mannol ", ["MANNOL", "Royal"])).toBe("MANNOL");
    expect(canonicalBrand("ROYAL", ["MANNOL", "Royal"])).toBe("Royal");
    expect(canonicalBrand("  Castrol  Edge ", ["MANNOL"])).toBe("Castrol Edge");
    expect(canonicalBrand("", ["MANNOL"])).toBe("");
    expect(canonicalBrand("total", ["MANNOL"])).toBe("Total");          // nueva en minúsculas → capitalizada
    expect(canonicalBrand("liqui moly", [])).toBe("Liqui Moly");
    expect(canonicalBrand("ELF", ["MANNOL"])).toBe("ELF");              // con mayúsculas se respeta
  });
  it("lista registradas (en su orden) + las de los productos, sin repetir", () => {
    const brands = [{ name: "Royal", sortOrder: 2 }, { name: "MANNOL", sortOrder: 1 }, { name: "Vieja", sortOrder: 0, active: false }];
    expect(knownBrandNames(brands, PRODUCTS)).toEqual(["MANNOL", "Royal", "Castrol"]);
  });
  it("marcas por defecto que faltan", () => {
    expect(DEFAULT_BRANDS.map((b) => b.name)).toEqual(["MANNOL", "Royal"]);
    expect(missingDefaultBrands([{ name: "mannol" }]).map((b) => b.name)).toEqual(["Royal"]);
  });
});

describe("categorías", () => {
  it("las subcategorías cuentan para su categoría principal; por nombre si falta el id", () => {
    const idx = indexCategories(CATS);
    expect(topCategoryId(PRODUCTS[0], idx)).toBe("c-lub");
    expect(topCategoryId(PRODUCTS[1], idx)).toBe("c-fil");
    expect(topCategoryId(PRODUCTS[4], idx)).toBe("c-lub");
    expect(topCategoryId(PRODUCTS[5], idx)).toBe(null);
  });
  it("tipos por defecto: los 5 pedidos, y detecta los que faltan sin importar plurales", () => {
    expect(DEFAULT_CATEGORY_TYPES.map((t) => t.name)).toEqual(["Refrigerante", "Líquido de freno", "Filtros", "Lubricantes", "Aditivos"]);
    const existing = [{ id: "x", name: "Líquidos de frenos", parentId: null }, { id: "y", name: "FILTRO", parentId: null }, { id: "z", name: "Aditivos", parentId: "y" }];
    expect(missingDefaultTypes(existing).map((t) => t.name)).toEqual(["Refrigerante", "Lubricantes", "Aditivos"]);
    expect(missingDefaultTypes(CATS)).toEqual([]);
  });
});

describe("chips del catálogo", () => {
  it("solo muestra tipos y marcas con productos, en su orden, con contadores", () => {
    const f = buildCatalogFacets(PRODUCTS, CATS, [{ name: "MANNOL", sortOrder: 1 }, { name: "Royal", sortOrder: 2 }]);
    expect(f.categories.map((c) => [c.name, c.count])).toEqual([["Refrigerante", 1], ["Líquido de freno", 1], ["Filtros", 1], ["Lubricantes", 2]]);
    expect(f.uncategorized.count).toBe(1);
    expect(f.brands.map((b) => [b.name, b.count])).toEqual([["MANNOL", 3], ["Royal", 2], ["Castrol", 1]]);
    expect(f.total).toBe(6);
  });
  it("contador cruzado: cuántos de cada tipo hay en la marca elegida (y viceversa)", () => {
    const f = buildCatalogFacets(PRODUCTS, CATS, [], { brandKey: "royal", categoryId: "c-lub" });
    expect(f.categories.find((c) => c.id === "c-ref").countHere).toBe(1);
    expect(f.categories.find((c) => c.id === "c-lub").countHere).toBe(0);
    expect(f.brands.find((b) => b.key === "mannol").countHere).toBe(2);
    expect(f.brands.find((b) => b.key === "royal").countHere).toBe(0);
  });
  it("filtra por tipo + marca + búsqueda (todas las palabras)", () => {
    const ids = (o) => filterCatalog(PRODUCTS, CATS, o).map((p) => p.id);
    expect(ids({ categoryId: "c-lub" })).toEqual(["p1", "p5"]);
    expect(ids({ brandKey: "royal" })).toEqual(["p3", "p4"]);
    expect(ids({ categoryId: "c-fre", brandKey: "royal" })).toEqual(["p4"]);
    expect(ids({ categoryId: NO_CATEGORY })).toEqual(["p6"]);
    expect(ids({ search: "frenos dot" })).toEqual(["p4"]);
    expect(ids({ search: "5w-30" })).toEqual(["p1"]);
    expect(ids({ categoryId: "c-fil", search: "dot" })).toEqual([]);
  });
});

describe("sugerencias para organizar", () => {
  const sug = (name, extra = {}) => {
    const id = suggestCategoryId({ name, ...extra }, CATS);
    return id && CATS.find((c) => c.id === id).name;
  };
  it("reconoce el tipo por el nombre (filtro antes que aceite, aditivo antes que aceite)", () => {
    expect(sug("Filtro de Aceite Mannol W610/1")).toBe("Filtros");
    expect(sug("Líquido Frenos Mannol DOT 4")).toBe("Líquido de freno");
    expect(sug("Royal DOT3 500ml")).toBe("Líquido de freno");
    expect(sug("Refrigerante Mannol G12+")).toBe("Refrigerante");
    expect(sug("Anticongelante concentrado")).toBe("Refrigerante");
    expect(sug("MANNOL Energy Formula 5W-30")).toBe("Lubricantes");
    expect(sug("Grasa Multiuso Mannol 400g")).toBe("Lubricantes");
    expect(sug("Aditivo para aceite de motor")).toBe("Aditivos");
    expect(sug("Royal Limpia Inyectores")).toBe("Aditivos");
    expect(sug("Producto X", { viscosity: "10W-40" })).toBe("Lubricantes");
    expect(sug("Líquido Limpiaparabrisas -10°C")).toBe(null);
  });
  it("usa la categoría que ya tenías si tiene otro nombre parecido", () => {
    const legacy = [{ id: "a", name: "Aceites de Motor", parentId: null }, { id: "b", name: "Filtros", parentId: null }];
    expect(findCategoryForType("lubricantes", legacy)?.id).toBe("a");
    expect(suggestCategoryId({ name: "MANNOL 10W-40" }, legacy)).toBe("a");
    expect(suggestCategoryId({ name: "Refrigerante" }, legacy)).toBe(null); // no existe ese tipo
  });
  it("marca sugerida", () => {
    const names = ["MANNOL", "Royal"];
    expect(suggestBrand({ name: "Algo", brand: "mannol" }, names)).toBe("MANNOL");
    expect(suggestBrand({ name: "Royal Refrigerante 1L", brand: "" }, names)).toBe("Royal");
    expect(suggestBrand({ name: "Filtro MANNOL W712", brand: "Otra" }, names)).toBe("MANNOL");
    expect(suggestBrand({ name: "Producto", brand: "Castrol" }, names)).toBe("Castrol");
  });
});

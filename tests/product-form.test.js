// =====================================================
// Tests: lógica del formulario de producto (v5.15.0)
//  · Marca: todas las marcas conocidas para elegir (antes un datalist que solo
//    sugería las que coincidían con lo escrito → con "MANNOL" no salía ninguna).
//  · Números con coma o punto.
//  · Precios por caja en filas "desde N cajas" ↔ la forma guardada de siempre.
//  · Revisión campo a campo.
// =====================================================
import { describe, it, expect } from "vitest";
import {
  parseDecimal, numberToInput, money2, brandChoices, findBrand, tiersToRows, isBlankTierRow,
  rowsToTiers, tierRangeLabel, tierPerBox, wholesaleSummary, marginInfo, validateProductForm,
} from "../js/product-form.js";
import { getWholesaleTier } from "../js/db.js";

describe("parseDecimal — coma o punto", () => {
  it("vacío → null; coma y punto decimales", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal("22.50")).toBe(22.5);
    expect(parseDecimal(" 3 ")).toBe(3);
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal("5,")).toBe(5);
    expect(parseDecimal(7.25)).toBe(7.25);
  });
  it("separadores de miles", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("1,234.5")).toBe(1234.5);
    expect(parseDecimal("1.234.567")).toBe(1234567);
    // un solo separador siempre es decimal
    expect(parseDecimal("1.500")).toBe(1.5);
  });
  it("texto que no es número → NaN; signo", () => {
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("12a")).toBeNaN();
    expect(parseDecimal("1,2,3.4,5")).toBeNaN();
    expect(parseDecimal("-2")).toBe(-2);
    expect(parseDecimal("+4")).toBe(4);
  });
  it("numberToInput y money2", () => {
    expect(numberToInput(null)).toBe("");
    expect(numberToInput(undefined)).toBe("");
    expect(numberToInput(0)).toBe("0");
    expect(numberToInput(22.5)).toBe("22.5");
    expect(money2(3.5999999)).toBe("3.60");
    expect(money2(1.2 * 3)).toBe("3.60");
  });
});

describe("marcas: se ofrecen todas", () => {
  it("todas las conocidas, sin repetir, en su orden; la del producto elegida en su forma oficial", () => {
    const r = brandChoices(["MANNOL", "Royal", "mannol", " Castrol ", "", null], "royal");
    expect(r.list).toEqual(["MANNOL", "Royal", "Castrol"]);
    expect(r.selected).toBe("Royal");
  });
  it("una marca del producto que no está en la lista se añade al final", () => {
    const r = brandChoices(["MANNOL", "Royal"], "total");
    expect(r.list).toEqual(["MANNOL", "Royal", "Total"]);
    expect(r.selected).toBe("Total");
  });
  it("sin marca → nada elegido", () => {
    expect(brandChoices(["MANNOL"], "").selected).toBe("");
    expect(brandChoices([], undefined)).toEqual({ list: [], selected: "" });
  });
  it("findBrand ignora mayúsculas, tildes y espacios", () => {
    expect(findBrand("  mannól ", ["MANNOL", "Royal"])).toBe("MANNOL");
    expect(findBrand("liqui  moly", ["Liqui Moly"])).toBe("Liqui Moly");
    expect(findBrand("Fuchs", ["MANNOL"])).toBe("");
    expect(findBrand("", ["MANNOL"])).toBe("");
  });
});

const DEMO_TIERS = [
  { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0.5, gestorCommission: 0.3 },
  { minBoxes: 6, maxBoxes: 20, pricePerUnit: 20, vendorCommission: 0.75, gestorCommission: 0.4 },
  { minBoxes: 21, maxBoxes: null, pricePerUnit: 18, vendorCommission: 1, gestorCommission: 0.5 },
];

describe("precios por caja: filas ↔ tramos guardados", () => {
  it("ida y vuelta sin cambios (tramos seguidos, el último sin tope)", () => {
    const rows = tiersToRows(DEMO_TIERS);
    expect(rows.map((r) => r.minBoxes)).toEqual(["1", "6", "21"]);
    expect(rowsToTiers(rows)).toEqual({ tiers: DEMO_TIERS, errors: [] });
  });
  it("ordena al cargar y conserva datos extra de cada tramo", () => {
    const rows = tiersToRows([DEMO_TIERS[2], { ...DEMO_TIERS[0], nota: "x" }, DEMO_TIERS[1]]);
    expect(rows.map((r) => r.pricePerUnit)).toEqual(["22", "20", "18"]);
    expect(rowsToTiers(rows).tiers[0]).toEqual({ nota: "x", ...DEMO_TIERS[0] });
  });
  it("el 1.º tramo empieza en 1 caja (por debajo ya se aplicaba el primero)", () => {
    const rows = tiersToRows([{ minBoxes: 3, maxBoxes: 9, pricePerUnit: 10 }]);
    expect(rows[0].minBoxes).toBe("1");
    const { tiers } = rowsToTiers(rows);
    expect(tiers).toEqual([{ minBoxes: 1, maxBoxes: null, pricePerUnit: 10, vendorCommission: 0, gestorCommission: 0 }]);
    for (const boxes of [1, 2, 3, 50]) {
      expect(getWholesaleTier({ wholesaleTiers: tiers }, boxes).pricePerUnit)
        .toBe(getWholesaleTier({ wholesaleTiers: [{ minBoxes: 3, maxBoxes: 9, pricePerUnit: 10 }] }, Math.min(boxes, 9)).pricePerUnit);
    }
  });
  it("«hasta» sale solo: desde del siguiente − 1; acepta coma", () => {
    const { tiers, errors } = rowsToTiers([
      { pricePerUnit: "22" },
      { minBoxes: "6", pricePerUnit: "20,5", vendorCommission: "0,75" },
      { minBoxes: "", pricePerUnit: "" }, // fila vacía → se ignora
    ]);
    expect(errors).toEqual([]);
    expect(tiers).toEqual([
      { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22, vendorCommission: 0, gestorCommission: 0 },
      { minBoxes: 6, maxBoxes: null, pricePerUnit: 20.5, vendorCommission: 0.75, gestorCommission: 0 },
    ]);
  });
  it("con huecos o tope en el último, la venta da lo mismo o mejor (último sin tope)", () => {
    const old = [
      { minBoxes: 1, maxBoxes: 5, pricePerUnit: 22 },
      { minBoxes: 10, maxBoxes: 20, pricePerUnit: 19 },
    ];
    const { tiers } = rowsToTiers(tiersToRows(old));
    const price = (t, n) => getWholesaleTier({ wholesaleTiers: t }, n).pricePerUnit;
    for (const n of [1, 5, 7, 9, 10, 20]) expect(price(tiers, n)).toBe(price(old, n));
    expect(price(old, 25)).toBe(22);   // antes: más de 20 cajas volvía al precio de 1 caja
    expect(price(tiers, 25)).toBe(19); // ahora: sigue el último precio
  });
  it("errores por fila: desde ≤ anterior, no entero, precio que falta o no es número", () => {
    const { tiers, errors } = rowsToTiers([
      { pricePerUnit: "22" },
      { minBoxes: "1", pricePerUnit: "20" },
      { minBoxes: "6.5", pricePerUnit: "x" },
      { minBoxes: "30", pricePerUnit: "", vendorCommission: "-1" },
    ]);
    expect(tiers).toEqual([]);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 1, field: "minBoxes" }),
      expect.objectContaining({ index: 2, field: "minBoxes" }),
      expect.objectContaining({ index: 2, field: "pricePerUnit" }),
      expect.objectContaining({ index: 3, field: "pricePerUnit" }),
      expect.objectContaining({ index: 3, field: "vendorCommission" }),
    ]));
    const repeated = rowsToTiers([{ pricePerUnit: "22" }, { minBoxes: "6", pricePerUnit: "20" }, { minBoxes: "6", pricePerUnit: "19" }]);
    expect(repeated.errors).toEqual([expect.objectContaining({ index: 2, field: "minBoxes", message: expect.stringContaining("más de 6") })]);
  });
  it("precio base vacío con otros precios puestos → error en la 1.ª fila", () => {
    const r = rowsToTiers([{ pricePerUnit: "" }, { minBoxes: "6", pricePerUnit: "20" }]);
    expect(r.errors).toEqual([expect.objectContaining({ index: 0, field: "pricePerUnit" })]);
  });
  it("todo vacío → sin tramos y sin errores", () => {
    expect(rowsToTiers([{ minBoxes: "1", pricePerUnit: "" }, { minBoxes: "", pricePerUnit: "" }])).toEqual({ tiers: [], errors: [] });
    expect(rowsToTiers([])).toEqual({ tiers: [], errors: [] });
    expect(rowsToTiers(null)).toEqual({ tiers: [], errors: [] });
    expect(isBlankTierRow({ minBoxes: "1" }, 0)).toBe(true);
    expect(isBlankTierRow({ minBoxes: "6" }, 1)).toBe(false);
  });
  it("rangos, total por caja y resumen", () => {
    expect(tierRangeLabel(1, 6)).toBe("1 a 5 cajas");
    expect(tierRangeLabel(6, null)).toBe("6 cajas o más");
    expect(tierRangeLabel(1, 2)).toBe("1 caja");
    expect(tierRangeLabel("21", "")).toBe("21 cajas o más");
    expect(tierRangeLabel("", 6)).toBe("");
    expect(tierPerBox({ pricePerUnit: "22", vendorCommission: "0.5", gestorCommission: "0,3" }, "6")).toEqual({ price: 132, vendor: 3, gestor: 1.8 });
    expect(tierPerBox({ pricePerUnit: "1.2" }, 3)).toEqual({ price: 3.6, vendor: 0, gestor: 0 });
    expect(tierPerBox({ pricePerUnit: "22" }, "")).toBeNull();
    expect(wholesaleSummary(false, "6", [])).toBe("No se vende por caja");
    expect(wholesaleSummary(true, "", [])).toMatch(/cuántos pomos/);
    expect(wholesaleSummary(true, "6", [{ pricePerUnit: "" }])).toBe("6 pomos por caja · falta el precio por caja");
    expect(wholesaleSummary(true, "6", [{ pricePerUnit: "22" }, { minBoxes: "6", pricePerUnit: "20" }])).toBe("6 pomos por caja · 2 precios");
  });
});

describe("ganancia y revisión del formulario", () => {
  it("ganancia por unidad", () => {
    expect(marginInfo("22", "15")).toEqual({ profit: 7, pct: 47 });
    expect(marginInfo("10", "12")).toEqual({ profit: -2, pct: -17 });
    expect(marginInfo("22", "")).toBeNull();
    expect(marginInfo("", "15")).toBeNull();
  });
  it("falta nombre, marca y precio → un mensaje para cada uno", () => {
    const r = validateProductForm({ name: "  ", brand: "", price: "" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(["brand", "name", "price"]);
  });
  it("precio 0, negativo o con letras", () => {
    expect(validateProductForm({ name: "a", brand: "b", price: "0" }).errors.price).toMatch(/mayor que 0/);
    expect(validateProductForm({ name: "a", brand: "b", price: "-3" }).errors.price).toMatch(/mayor que 0/);
    expect(validateProductForm({ name: "a", brand: "b", price: "12x" }).errors.price).toMatch(/números/);
  });
  it("stock mínimo entero; comisiones y costo no negativos", () => {
    const r = validateProductForm({ name: "a", brand: "b", price: "5", minStock: "2.5", vendorCommission: "-1", gestorCommission: "x", costPrice: "-2" });
    expect(Object.keys(r.errors).sort()).toEqual(["costPrice", "gestorCommission", "minStock", "vendorCommission"]);
  });
  it("avisos que no impiden guardar: comisión del vendedor en 0, costo mayor que el precio", () => {
    const r = validateProductForm({ name: "a", brand: "b", price: "10", costPrice: "12", vendorCommission: "" });
    expect(r.ok).toBe(true);
    expect(r.warnings.vendorCommission).toMatch(/no gana nada/);
    expect(r.warnings.costPrice).toMatch(/mayor que el precio/);
    expect(validateProductForm({ name: "a", brand: "b", price: "10", vendorCommission: "50" }).warnings.vendorCommission).toBeUndefined();
  });
  it("todo bien → valores ya convertidos (coma decimal incluida)", () => {
    const r = validateProductForm({
      name: "  Aceite   5W-30 ", brand: " MANNOL ", price: "22,5", costPrice: "15", minStock: "", vendorCommission: "0,75", gestorCommission: "1",
      wholesale: true, unitsPerBox: "6", tiers: [{ pricePerUnit: "21" }, { minBoxes: "6", pricePerUnit: "20" }],
    });
    expect(r.ok).toBe(true);
    expect(r.values).toEqual({
      name: "Aceite 5W-30", brand: "MANNOL", salePrice: 22.5, costPrice: 15, minStock: 0,
      vendorCommission: 0.75, gestorCommission: 1, unitsPerBox: 6,
      wholesaleTiers: [
        { minBoxes: 1, maxBoxes: 5, pricePerUnit: 21, vendorCommission: 0, gestorCommission: 0 },
        { minBoxes: 6, maxBoxes: null, pricePerUnit: 20, vendorCommission: 0, gestorCommission: 0 },
      ],
    });
  });
  it("venta por caja encendida: pomos por caja obligatorio; sin precios solo avisa", () => {
    const a = validateProductForm({ name: "a", brand: "b", price: "5", wholesale: true, unitsPerBox: "", tiers: [{ pricePerUnit: "4" }] });
    expect(a.errors.unitsPerBox).toBeTruthy();
    const b = validateProductForm({ name: "a", brand: "b", price: "5", wholesale: true, unitsPerBox: "12", tiers: [{ pricePerUnit: "" }] });
    expect(b.ok).toBe(true);
    expect(b.warnings.tiers).toMatch(/no se podrá vender por caja/);
    expect(b.values).toMatchObject({ unitsPerBox: 12, wholesaleTiers: [] });
    const off = validateProductForm({ name: "a", brand: "b", price: "5", wholesale: false, unitsPerBox: "x", tiers: [{ pricePerUnit: "x" }] });
    expect(off.ok).toBe(true);
    expect(off.values).toMatchObject({ unitsPerBox: null, wholesaleTiers: [] });
  });
});

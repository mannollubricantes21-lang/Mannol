import { describe, it, expect } from "vitest";
import { buildBackupSheets } from "../js/backup.js";
import { buildXlsx, colName } from "../js/xlsx-lite.js";
import { missingClosures } from "../js/sales-stats.js";

describe("copia de seguridad (v5.34)", () => {
  const data = {
    warehouses: [{ id: "w1", name: "Víbora", code: "VIB" }],
    products: [{ id: "p1", name: "Aceite", brand: "MANNOL", salePrice: 20, costPrice: 15, minStock: 5,
      unitsPerBox: 12, wholesaleTiers: [{ minBoxes: 10, pricePerBox: 200, gestorCommissionPercent: 3 }] }],
    stock: [{ warehouseId: "w1", productId: "p1", quantity: 30 }],
    managers: [{ name: "Ana", commissionType: "PERCENT", commission: 5 }],
    sales: [{ code: "VIB-1", createdAt: Date.UTC(2026, 10, 2, 15), warehouseId: "w1", status: "COMPLETADA", totalAmount: 40, currency: "USD",
      items: [{ productId: "p1", quantity: 2, unitPrice: 20, subtotal: 40, vendorSaleCommission: 1, vendorSaleCommissionCurrency: "USD" }] }],
    closures: [{ closureDate: "2026-11-02", warehouseId: "w1", salesCount: 1, unitsSold: 2, totalUSD: 40 }],
  };
  it("una hoja por cosa, con sus filas", () => {
    const sh = buildBackupSheets(data);
    expect(sh.map((s) => s.name)).toEqual(["Resumen", "Ventas", "Detalle de ventas", "Productos", "Stock", "Almacenes", "Gestores", "Cierres de caja"]);
    const ventas = sh.find((s) => s.name === "Ventas").rows;
    expect(ventas[1][0]).toBe("VIB-1");
    expect(ventas[1][2]).toBe("Víbora");
    expect(ventas[1][13]).toBe(1); // vendedor gana USD
    const prod = sh.find((s) => s.name === "Productos").rows[1];
    expect(prod.slice(9)).toEqual([12, 10, 200, 3]);
    expect(sh.find((s) => s.name === "Stock").rows[1]).toEqual(["Víbora", "Aceite", 30]);
  });
  it("el .xlsx es un zip válido", () => {
    const bytes = buildXlsx(buildBackupSheets(data));
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b); // "PK"
    expect(colName(0)).toBe("A"); expect(colName(25)).toBe("Z"); expect(colName(27)).toBe("AB");
  });
});

describe("caja sin cerrar (v5.34)", () => {
  const ws = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  it("avisa solo de los que vendieron y no cerraron", () => {
    const r = missingClosures(ws, [{ closureDate: "2026-11-25", warehouseId: "a" }],
      [[{ status: "COMPLETADA", totalAmount: 10 }], [{ status: "COMPLETADA", totalAmount: 5 }, { status: "CANCELADA", totalAmount: 9 }], []], "2026-11-25");
    expect(r).toEqual([{ warehouse: ws[1], sales: 1, totalUSD: 5 }]);
  });
  it("si no se pudieron leer las ventas, no inventa avisos", () => {
    expect(missingClosures(ws, [], [null, null, null], "2026-11-25")).toEqual([]);
  });
});

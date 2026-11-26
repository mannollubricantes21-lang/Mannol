// =====================================================
// Copia de seguridad en Excel (v5.34.0)
//
// Admin → Configuración → Copia de seguridad: un .xlsx con una hoja por cosa
// (ventas, detalle, productos, stock, almacenes, gestores, cierres). La parte
// que arma las hojas es pura (se prueba sin navegador); la descarga está en
// el panel del admin.
// =====================================================
import { saleVendorCommission, sellerModeOf } from "./seller-earnings.js";
import { wholesaleConfigOf } from "./wholesale-config.js";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fecha = (ms) => {
  const t = typeof ms === "number" ? ms : Date.parse(ms);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const ESTADO = { COMPLETADA: "Completada", PENDIENTE: "Por confirmar", CANCELADA: "Cancelada" };

/**
 * @param {object} d  { warehouses, products, stock, managers, sales, closures, from, to, now }
 * @returns {{ name: string, rows: any[][] }[]}
 */
export function buildBackupSheets(d = {}) {
  const warehouses = d.warehouses || [];
  const products = d.products || [];
  const sales = [...(d.sales || [])].sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || "";
  const prodName = (id) => products.find((p) => p.id === id)?.name || "";

  const ventas = [["Código", "Fecha", "Almacén", "Vendedor", "Tipo", "Estado", "Gestor", "Pago", "Total USD",
    "Pagado USD", "Pagado MN", "Pagado EUR", "Transferencia", "Vendedor gana USD", "Vendedor gana MN", "Gestor gana USD", "Gestor gana MN", "Pomos"]];
  const detalle = [["Código venta", "Fecha", "Almacén", "Producto", "Marca", "Cantidad", "Precio", "Subtotal", "Cajas", "Precio caja"]];
  for (const s of sales) {
    const items = Array.isArray(s.items) ? s.items : [];
    const v = saleVendorCommission(s);
    ventas.push([
      s.code || s.id, fecha(s.createdAt), s.warehouseName || whName(s.warehouseId), s.userName || "",
      s.saleType === "WHOLESALE" ? "Por caja" : "Normal", ESTADO[s.status] || s.status || "",
      s.managerName || "", s.isMultiCurrency ? "Mixto" : (s.currency || ""), r2(s.totalAmount ?? s.totalUSD),
      r2(s.paidUSD), r2(s.paidMN), r2(s.paidEUR), r2(s.paidTransfer),
      r2(v.usd), r2(v.mn), r2(s.gestorCommissionUSD), r2(s.gestorCommissionMN),
      items.reduce((a, it) => a + (Number(it.quantity) || 0), 0),
    ]);
    for (const it of items) {
      detalle.push([
        s.code || s.id, fecha(s.createdAt), s.warehouseName || whName(s.warehouseId),
        it.name || it.productName || prodName(it.productId), it.brand || "", Number(it.quantity) || 0,
        r2(it.unitPrice), r2(it.subtotal ?? (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)),
        it.isWholesale ? Number(it.boxes) || "" : "", it.isWholesale ? r2(it.pricePerBox) : "",
      ]);
    }
  }

  const productos = [["Producto", "Marca", "SKU", "Categoría", "Costo USD", "Precio USD", "Stock mínimo", "Activo",
    "Comisión propia vendedor", "Pomos por caja", "Mínimo cajas", "Precio caja USD", "Gestor % caja"]];
  for (const p of [...products].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const w = wholesaleConfigOf(p);
    productos.push([
      p.name, p.brand || "", p.sku || "", p.categoryName || "", r2(p.costPrice), r2(p.salePrice), Number(p.minStock) || 0,
      p.active === false ? "No" : "Sí",
      p.ownVendorCommission ? `${p.vendorCommission} ${p.vendorCommissionCurrency || "MN"}/u` : "",
      w ? w.unitsPerBox : "", w ? w.minBoxes : "", w ? w.pricePerBox : "", w ? w.gestorPct : "",
    ]);
  }

  const stock = [["Almacén", "Producto", "Cantidad"]];
  for (const st of [...(d.stock || [])].sort((a, b) => `${a.warehouseName || whName(a.warehouseId)}${prodName(a.productId)}`.localeCompare(`${b.warehouseName || whName(b.warehouseId)}${prodName(b.productId)}`))) {
    stock.push([st.warehouseName || whName(st.warehouseId), st.productName || prodName(st.productId), Number(st.quantity) || 0]);
  }

  const almacenes = [["Almacén", "Código", "Dirección", "Teléfono", "Activo", "Vendedores"]];
  for (const w of warehouses) {
    const two = sellerModeOf(w) !== "one";
    almacenes.push([w.name, w.code, w.address || "", w.phone || "", w.active === false ? "No" : "Sí",
      [w.sellerName, two ? w.sellerWeekendName : null].filter(Boolean).join(" y ")]);
  }

  const gestores = [["Gestor", "Código", "Teléfono", "Comisión", "Activo"]];
  for (const m of d.managers || []) {
    gestores.push([m.name, m.code || "", m.phone || "",
      (m.commissionType || "PERCENT") === "PERCENT" ? `${m.commission ?? 5}%` : `${m.commission} ${m.commissionCurrency || "USD"} por venta`,
      m.active === false ? "No" : "Sí"]);
  }

  const cierres = [["Fecha", "Almacén", "Ventas", "Pomos", "Total USD", "Hecho por"]];
  for (const c of [...(d.closures || [])].sort((a, b) => String(a.closureDate).localeCompare(String(b.closureDate)))) {
    cierres.push([c.closureDate, c.warehouseName || whName(c.warehouseId), Number(c.salesCount) || 0, Number(c.unitsSold) || 0,
      r2(c.totalUSD ?? c.totalUsd), c.createdByName || ""]);
  }

  const ok = sales.filter((s) => s.status !== "CANCELADA");
  const resumen = [
    ["Copia de seguridad MANNOL", ""],
    ["Hecha el", fecha(d.now || Date.now())],
    ["Ventas desde", d.from ? fecha(d.from).slice(0, 10) : "—"],
    ["Ventas hasta", d.to ? fecha(d.to - 1).slice(0, 10) : "—"],
    ["Ventas (sin canceladas)", ok.length],
    ["Total vendido USD", r2(ok.reduce((a, s) => a + (Number(s.totalAmount ?? s.totalUSD) || 0), 0))],
    ["Productos", products.length],
    ["Almacenes", warehouses.length],
    ["Gestores", (d.managers || []).length],
  ];

  return [
    { name: "Resumen", rows: resumen },
    { name: "Ventas", rows: ventas },
    { name: "Detalle de ventas", rows: detalle },
    { name: "Productos", rows: productos },
    { name: "Stock", rows: stock },
    { name: "Almacenes", rows: almacenes },
    { name: "Gestores", rows: gestores },
    { name: "Cierres de caja", rows: cierres },
  ];
}

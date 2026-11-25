// =====================================================
// Ticket de venta y «Vender de nuevo» (puro, testeado) — v5.21.0
// =====================================================

/**
 * Texto del ticket para compartir por WhatsApp o copiar.
 * @param {Object} sale
 * @param {(n:number, c:string) => string} fmt  formatMoney
 */
export function buildTicketText(sale, fmt) {
  const lines = [];
  lines.push("MANNOL");
  lines.push(`Venta ${sale.code || ""}${sale.warehouseName ? " · " + sale.warehouseName : ""}`.trim());
  if (sale.createdAt) lines.push(new Date(sale.createdAt).toLocaleString("es-ES"));
  lines.push("--------------------------------");
  for (const i of sale.items || []) {
    const qty = i.isWholesale ? `${i.boxes} caja(s)` : `${i.quantity} u`;
    lines.push(`${qty} · ${i.name || i.productName || "Producto"} = ${fmt(i.subtotal, "USD")}`);
  }
  lines.push("--------------------------------");
  lines.push(`TOTAL: ${fmt(sale.totalAmount, "USD")}`);
  lines.push(`Pago: ${paymentSummary(sale, fmt)}`);
  if (sale.note) lines.push(`Nota: ${sale.note}`);
  lines.push("¡Gracias por su compra!");
  return lines.join("\n");
}

/** «USD $5.00 + MN 12,870 (1 USD = 330 MN)» o «USD $44.00». */
export function paymentSummary(sale, fmt) {
  if (sale.paymentMode === "MULTI") {
    const lines = Array.isArray(sale.payments) && sale.payments.length
      ? sale.payments
      : [
          { currency: "USD", amount: sale.paidUSD },
          { currency: "MN", amount: sale.paidMN },
          { currency: "EUR", amount: sale.paidEUR },
          { currency: "TRANSFERENCIA", amount: sale.paidTransfer },
        ].filter((l) => Number(l.amount) > 0);
    return lines.map((l) => {
      const cur = l.currency === "TRANSFERENCIA" ? "Transf." : l.currency;
      const rate = mnRateLabel(l);
      return `${cur} ${fmt(l.amount, l.currency === "TRANSFERENCIA" ? "USD" : l.currency)}${rate ? ` (${rate})` : ""}`;
    }).join(" + ");
  }
  const c = sale.currency || "USD";
  // El monto en SU moneda (v5.16+ lo guarda en payments); antes se mostraba
  // el total en USD con el símbolo de la otra moneda («€54» siendo $54)
  const line = Array.isArray(sale.payments) ? sale.payments.find((l) => l.currency === c) : null;
  const amount = line && Number(line.amount) > 0 ? line.amount : sale.totalAmount;
  const cur = line ? c : "USD";
  return `${c === "TRANSFERENCIA" ? "Transf." : c} ${fmt(amount, cur === "TRANSFERENCIA" ? "USD" : cur)}`;
}

/** Para una línea de pago en MN: «1 USD = 330 MN (+10)». */
export function mnRateLabel(line) {
  if (!line || line.currency !== "MN") return "";
  const r = Number(line.exchangeRate);
  if (!(r > 0)) return "";
  const mn = Math.round(1 / r);
  const extra = Number(line.surchargeMNPerUSD) || 0;
  return `1 USD = ${mn} MN${extra > 0 ? ` · +${extra}` : ""}`;
}

/**
 * Productos de una venta para cargarlos otra vez en el carrito.
 * Solo menudeo (las cajas mayoristas se arman a mano). Junta repetidos.
 * @returns {Array<{productId, name, brand, quantity, unitPrice, subtotal}>}
 */
export function cartFromSale(sale) {
  const map = new Map();
  for (const i of sale?.items || []) {
    if (!i || i.isWholesale || !i.productId) continue;
    const q = Math.max(0, Math.floor(Number(i.quantity) || 0));
    if (!q) continue;
    const prev = map.get(i.productId);
    if (prev) {
      prev.quantity += q;
      prev.subtotal = prev.quantity * prev.unitPrice;
      continue;
    }
    const unitPrice = Number(i.unitPrice) || 0;
    map.set(i.productId, {
      productId: i.productId,
      name: i.name || i.productName || "",
      brand: i.brand || "",
      quantity: q,
      unitPrice,
      subtotal: q * unitPrice,
      gestorCommission: i.gestorCommission ?? 0,
      gestorCommissionCurrency: i.gestorCommissionCurrency || "USD",
      vendorCommission: i.vendorCommission ?? 0,
      vendorCommissionCurrency: i.vendorCommissionCurrency || "MN",
    });
  }
  return [...map.values()];
}

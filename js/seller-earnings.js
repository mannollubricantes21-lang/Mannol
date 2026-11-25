// =====================================================
// Comisión del vendedor — lo que lleva ganado (v5.14.0)
// =====================================================
// Regla del negocio: el vendedor gana un MONTO FIJO por cada producto vendido,
// que el admin configura en cada producto («Comisión del vendedor (por unidad)»,
// en USD o MN). Los gestores cobran aparte (porcentaje de la venta).
//
// · Cuenta lo configurado AL VENDER: el monto viaja dentro de cada ítem de la
//   venta (items[].vendorCommission + su moneda), que sí se guarda en la nube.
//   Los totales por venta (vendor_commission_usd/mn) nunca llegaban a la base
//   de datos —el nombre del campo se convertía mal y se descartaba—, así que
//   solo se usan en ventas antiguas que no tengan el dato en los ítems.
// · Mayorista: la comisión es por CAJA (cajas × comisión por caja, en USD). El
//   ítem guarda la cantidad en UNIDADES; por eso no se multiplica por quantity.
// · Solo cuentan las ventas COMPLETADAS (también las que aún esperan subir
//   desde este equipo). Las PENDIENTES salen aparte («por confirmar») y las
//   CANCELADAS no cuentan.
// · Turnos: si en un almacén venden dos personas —una de lunes a viernes y otra
//   sábado y domingo—, cada venta cuenta para quien trabaja ese día (hora local).
// =====================================================

import { formatMoneyGrouped } from "./currency.js";
import { icon, esc } from "./ui.js";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

export const SHIFT_LABELS = { all: "Vendedor", weekday: "Lunes a viernes", weekend: "Sábado y domingo" };

/** ¿Sábado o domingo? (hora local del equipo, igual que el resto de la app) */
export function isWeekendDay(ms) {
  const d = new Date(ms).getDay();
  return d === 0 || d === 6;
}

/** ¿El almacén tiene dos vendedores (lunes a viernes + fin de semana)? */
export function hasShiftSplit(warehouse) {
  return !!(warehouse && warehouse.sellerWeekendSplit);
}

/** Turno al que pertenece una venta: "all" (una persona), "weekday" o "weekend". */
export function shiftKeyFor(ms, warehouse) {
  if (!hasShiftSplit(warehouse)) return "all";
  return isWeekendDay(ms) ? "weekend" : "weekday";
}

/** Nombre configurado para el turno (vacío si el admin no lo puso). */
export function shiftPersonName(key, warehouse) {
  if (!warehouse) return "";
  const n = key === "weekend" ? warehouse.sellerWeekendName : warehouse.sellerName;
  return String(n || "").trim();
}

/** Mes de `now` desplazado `offset` meses: { from, to (exclusivo), year, month, monthName, label } */
export function monthRange(now = Date.now(), offset = 0) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const monthName = MONTHS[start.getMonth()];
  return {
    from: start.getTime(),
    to: end.getTime(),
    year: start.getFullYear(),
    month: start.getMonth() + 1,
    monthName,
    label: `${monthName} ${start.getFullYear()}`,
  };
}

/**
 * Comisión del vendedor de UN ítem de venta.
 * @returns {{usd:number, mn:number, units:number, boxes:number, configured:boolean}}
 */
export function itemVendorCommission(item, sale) {
  const out = { usd: 0, mn: 0, units: num(item && item.quantity), boxes: 0, configured: false };
  if (!item) return out;
  const perBox = item.vendorCommissionPerBox;
  const isBox = item.isWholesale === true || (perBox != null && item.boxes != null);
  if (isBox) {
    const boxes = num(item.boxes != null ? item.boxes : sale && sale.boxes);
    const c = perBox != null ? perBox : item.vendorCommission;
    out.boxes = boxes;
    if (c != null) {
      out.configured = true;
      out.usd = round2(boxes * num(c)); // mayorista: siempre USD
    }
    return out;
  }
  if (item.vendorCommission == null) return out;
  out.configured = true;
  const amount = round2(num(item.vendorCommission) * out.units);
  // Sin moneda → MN (mismo criterio que sumCartCommissions al vender)
  if (String(item.vendorCommissionCurrency || "MN").toUpperCase() === "USD") out.usd = amount;
  else out.mn = amount;
  return out;
}

/**
 * Comisión del vendedor de UNA venta (suma de sus ítems).
 * @returns {{usd:number, mn:number, units:number, configured:boolean}}
 */
export function saleVendorCommission(sale) {
  let usd = 0, mn = 0, units = 0, configured = false;
  const items = Array.isArray(sale && sale.items) ? sale.items : [];
  for (const it of items) {
    const c = itemVendorCommission(it, sale);
    units += c.units;
    if (c.configured) { configured = true; usd += c.usd; mn += c.mn; }
  }
  // Venta mayorista antigua sin el dato en el ítem
  if (!configured && sale && sale.saleType === "WHOLESALE" && sale.vendorCommissionPerBox != null) {
    usd += num(sale.boxes) * num(sale.vendorCommissionPerBox);
    configured = true;
  }
  // Ventas antiguas sin el dato en los ítems: totales guardados en la venta (si hay)
  if (!configured && sale) {
    const su = num(sale.vendorCommissionUSD != null ? sale.vendorCommissionUSD : sale.vendorCommissionUsd);
    const sm = num(sale.vendorCommissionMN != null ? sale.vendorCommissionMN : sale.vendorCommissionMn);
    if (su || sm) { usd += su; mn += sm; configured = true; }
  }
  return { usd: round2(usd), mn: round2(mn), units, configured };
}

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function startOfNextDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

function emptyShift(key, warehouse, split) {
  return {
    key,
    label: SHIFT_LABELS[key],
    // Una sola persona: su nombre es el de «lunes a viernes» (el campo principal)
    name: shiftPersonName(split ? key : "weekday", warehouse),
    usd: 0, mn: 0, sales: 0, units: 0,
    queued: 0,     // ventas contadas que aún esperan subir desde este equipo
    zeroSales: 0,  // ventas contadas cuyos productos no tenían comisión
    today: { usd: 0, mn: 0, sales: 0 },
    pending: { usd: 0, mn: 0, sales: 0 },
    _products: new Map(),
  };
}

/**
 * Lo ganado por el/los vendedor(es) de un almacén en un mes.
 * @param {Array} sales  ventas (del almacén) — se filtran por mes y estado aquí
 * @param {{warehouse?: object, now?: number, offset?: number}} [opts]
 *   offset 0 = mes de `now`; -1 = mes anterior
 */
export function computeSellerEarnings(sales, { warehouse = null, now = Date.now(), offset = 0 } = {}) {
  const range = monthRange(now, offset);
  const split = hasShiftSplit(warehouse);
  const keys = split ? ["weekday", "weekend"] : ["all"];
  const shifts = {};
  keys.forEach((k) => { shifts[k] = emptyShift(k, warehouse, split); });
  const t0 = startOfDay(now);
  const t1 = startOfNextDay(now);

  for (const s of Array.isArray(sales) ? sales : []) {
    const at = num(s && s.createdAt);
    if (!at || at < range.from || at >= range.to) continue;
    if (s.status !== "COMPLETADA" && s.status !== "PENDIENTE") continue;
    const sh = shifts[shiftKeyFor(at, warehouse)];
    const c = saleVendorCommission(s);
    if (s.status === "PENDIENTE") {
      sh.pending.usd += c.usd; sh.pending.mn += c.mn; sh.pending.sales++;
      continue;
    }
    sh.usd += c.usd; sh.mn += c.mn; sh.sales++; sh.units += c.units;
    if (!c.usd && !c.mn) sh.zeroSales++;
    if (s.pendingSync) sh.queued++;
    if (at >= t0 && at < t1) { sh.today.usd += c.usd; sh.today.mn += c.mn; sh.today.sales++; }
    for (const it of Array.isArray(s.items) ? s.items : []) {
      const ic = itemVendorCommission(it, s);
      const name = String((it && (it.name || it.productName)) || "Producto").trim();
      const key = `${(it && it.productId) || name}${ic.boxes ? "|caja" : ""}`;
      const p = sh._products.get(key) || { name, units: 0, boxes: 0, usd: 0, mn: 0, wholesale: !!ic.boxes };
      p.units += ic.units; p.boxes += ic.boxes; p.usd += ic.usd; p.mn += ic.mn;
      sh._products.set(key, p);
    }
  }

  const fin = (sh) => {
    const { _products, ...rest } = sh;
    return {
      ...rest,
      usd: round2(sh.usd), mn: round2(sh.mn),
      today: { usd: round2(sh.today.usd), mn: round2(sh.today.mn), sales: sh.today.sales },
      pending: { usd: round2(sh.pending.usd), mn: round2(sh.pending.mn), sales: sh.pending.sales },
      products: [..._products.values()]
        .map((p) => ({ ...p, usd: round2(p.usd), mn: round2(p.mn) }))
        .sort((a, b) => (b.mn - a.mn) || (b.usd - a.usd) || (b.units - a.units)),
    };
  };
  const list = keys.map((k) => fin(shifts[k]));
  const total = list.reduce((acc, sh) => ({
    usd: round2(acc.usd + sh.usd), mn: round2(acc.mn + sh.mn),
    sales: acc.sales + sh.sales, units: acc.units + sh.units,
  }), { usd: 0, mn: 0, sales: 0, units: 0 });

  return {
    ...range,
    split,
    shifts: list,
    total,
    isCurrent: offset === 0,
    todayKey: offset === 0 ? shiftKeyFor(now, warehouse) : null,
  };
}

/** Productos activos SIN comisión de vendedor (para avisar al admin). */
export function productsWithoutVendorCommission(products) {
  return (Array.isArray(products) ? products : [])
    .filter((p) => p && p.active !== false && !(num(p.vendorCommission) > 0));
}

// =====================================================
// Vista: tarjeta «Lo que llevas ganado»
// =====================================================

const money = (v, cur) => formatMoneyGrouped(v, cur);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "₱1,200.00" · "$3.00" · "₱1,200.00 + $3.00" (MN es la moneda por defecto) */
export function moneyPair(usd, mn) {
  const parts = [];
  if (mn || !usd) parts.push(money(mn, "MN"));
  if (usd) parts.push(money(usd, "USD"));
  return parts.join(" + ");
}

function amountBlock(usd, mn) {
  if (usd && !mn) return `<div class="earn-amount">${money(usd, "USD")}</div>`;
  return `<div class="earn-amount">${money(mn, "MN")}</div>${usd ? `<div class="earn-amount-usd">+ ${money(usd, "USD")}</div>` : ""}`;
}

function prevLine(prev, key, prevLoading) {
  if (prevLoading) return `<div class="earn-line earn-prev">Mes pasado: <span class="text-muted">cargando…</span></div>`;
  if (!prev) return "";
  const sh = prev.shifts.find((s) => s.key === key) || null;
  if (!sh) return "";
  const value = sh.sales ? `<strong>${moneyPair(sh.usd, sh.mn)}</strong>` : `<span class="text-muted">sin ventas</span>`;
  return `<div class="earn-line earn-prev">Mes pasado (${esc(prev.monthName)}): ${value}</div>`;
}

function shiftBlock(sh, cur, prev, prevLoading) {
  const isToday = cur.split && cur.todayKey === sh.key;
  const head = cur.split
    ? `<div class="earn-shift-head">
         <span class="earn-shift-days">${esc(sh.label)}</span>
         ${isToday ? `<span class="earn-today-pill">Hoy</span>` : ""}
       </div>
       ${sh.name ? `<div class="earn-shift-name">${esc(sh.name)}</div>` : ""}`
    : (sh.name ? `<div class="earn-shift-name">${esc(sh.name)}</div>` : "");
  const showToday = cur.isCurrent && sh.today.sales > 0;
  return `
    <div class="earn-shift${isToday ? " is-today" : ""}" data-earn-shift="${sh.key}">
      ${head}
      ${amountBlock(sh.usd, sh.mn)}
      <div class="earn-sub">${sh.sales
        ? `${plural(sh.sales, "venta", "ventas")} · ${plural(sh.units, "producto", "productos")}`
        : "Aún sin ventas este mes"}</div>
      ${showToday ? `<div class="earn-line">Hoy: <strong>${moneyPair(sh.today.usd, sh.today.mn)}</strong> · ${plural(sh.today.sales, "venta", "ventas")}</div>` : ""}
      ${sh.pending.sales && (sh.pending.usd || sh.pending.mn) ? `<div class="earn-line earn-pending">+ ${moneyPair(sh.pending.usd, sh.pending.mn)} por confirmar (${plural(sh.pending.sales, "venta", "ventas")})</div>` : ""}
      ${sh.queued ? `<div class="earn-line earn-queued">${icon("cloud", 11)} Incluye ${plural(sh.queued, "venta", "ventas")} por subir</div>` : ""}
      ${prevLine(prev, sh.key, prevLoading)}
    </div>`;
}

function detailsBlock(cur, open) {
  const any = cur.shifts.some((sh) => sh.products.length > 0);
  if (!any) return "";
  const lists = cur.shifts.map((sh) => {
    if (!sh.products.length) return "";
    const title = cur.split ? `<p class="earn-det-title">${esc(sh.label)}${sh.name ? ` · ${esc(sh.name)}` : ""}</p>` : "";
    return `${title}<ul class="earn-det-list">${sh.products.map((p) => `
      <li class="${p.usd || p.mn ? "" : "is-zero"}">
        <span class="earn-det-name">${esc(p.name)}</span>
        <span class="earn-det-qty">${p.wholesale ? plural(p.boxes, "caja", "cajas") : `${p.units} u.`}</span>
        <strong class="earn-det-amt">${moneyPair(p.usd, p.mn)}</strong>
      </li>`).join("")}</ul>`;
  }).join("");
  return `
    <details class="earn-details" data-earn-details${open ? " open" : ""}>
      <summary>Ver detalle por producto</summary>
      ${lists}
    </details>`;
}

/**
 * Tarjeta con lo ganado en el mes (y el mes pasado, para el día de cobro).
 * @param {ReturnType<typeof computeSellerEarnings>} cur  mes actual
 * @param {ReturnType<typeof computeSellerEarnings>|null} prev  mes anterior (null si no cargó)
 * @param {{open?: boolean, prevLoading?: boolean}} [opts]
 */
export function renderSellerEarningsCard(cur, prev, { open = false, prevLoading = false } = {}) {
  if (!cur) return "";
  const title = cur.split ? "Lo ganado este mes" : "Lo que llevas ganado";
  const unconfigured = cur.total.sales > 0 && !cur.total.usd && !cur.total.mn;
  return `
    <section class="card earn-card${cur.split ? " earn-card--split" : ""}" aria-label="${esc(title)}">
      <div class="earn-head">
        <h3 class="card-title flex items-center gap-1">${icon("wallet", 14)} ${title}</h3>
        <span class="earn-month">${esc(cur.monthName)}</span>
      </div>
      <div class="earn-body">
        <div class="earn-shifts">
          ${cur.shifts.map((sh) => shiftBlock(sh, cur, prev, prevLoading)).join("")}
        </div>
        ${unconfigured ? `<p class="earn-hint">${icon("alertTriangle", 12)} Los productos vendidos aún no tienen comisión de vendedor configurada. Avísale al administrador.</p>` : ""}
        ${detailsBlock(cur, open)}
        <p class="earn-note">${icon("info", 11)} Monto fijo por cada producto vendido, según lo que configura el administrador. No cuentan las ventas canceladas.${cur.split ? " Cada venta cuenta para quien trabaja ese día." : ""}</p>
      </div>
    </section>`;
}

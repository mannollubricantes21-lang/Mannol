// =====================================================
// Charts helpers — SVG inline, sin dependencias externas
// =====================================================
// Genera gráficos simples (bar, line, donut) como strings SVG
// para insertar con innerHTML. Tamaños responsive via viewBox.
// =====================================================

const COLORS = {
  primary: "var(--primary)",
  primaryTint: "var(--primary-tint)",
  accent: "var(--accent)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  textMuted: "var(--text-muted)",
  border: "var(--border)",
  bgSoft: "var(--bg-soft)",
  usd: "var(--accent-usd)",
  mn: "var(--accent-mn)",
  eur: "var(--accent-eur)",
  transfer: "var(--accent-transfer)",
};

/**
 * Bar chart — barras verticales con etiquetas.
 * @param {Array<{label:string, value:number, color?:string}>} data
 * @param {Object} opts - { height, max, formatValue }
 */
export function barChart(data, opts = {}) {
  // v5.11.0: mismas razones que lineChart → etiquetas en HTML (antes texto SVG
  // estirado e ilegible) y líneas guía de 1 px reales (vector-effect).
  const height = opts.height || 160;
  const maxVal = opts.max || Math.max(...data.map((d) => d.value), 1);
  const width = 100;
  const n = data.length || 1;
  const slot = width / n;
  const barWidth = slot * 0.62;
  const labelsH = 20;
  const chartHeight = Math.max(40, height - labelsH);
  const padTop = 4;
  const fmt = (v) => (opts.formatValue ? opts.formatValue(v) : v);

  // Líneas guía horizontales (grid) a 25%, 50%, 75%, 100%
  const gridLines = [0.25, 0.5, 0.75, 1].map((p) => {
    const y = Math.round((chartHeight - (chartHeight - padTop) * p) * 100) / 100;
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`;
  }).join("");

  const bars = data.map((d, i) => {
    const barHeight = Math.max(d.value > 0 ? 1.5 : 0, (d.value / maxVal) * (chartHeight - padTop));
    const x = Math.round((i * slot + (slot - barWidth) / 2) * 100) / 100;
    const y = Math.round((chartHeight - barHeight) * 100) / 100;
    return `<rect x="${x}" y="${y}" width="${Math.round(barWidth * 100) / 100}" height="${Math.round(barHeight * 100) / 100}" rx="0.6" fill="${d.color || COLORS.primary}" opacity="0.9"><title>${d.label}: ${fmt(d.value)}</title></rect>`;
  }).join("");

  const labels = data.map((d) => `<span style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.label}</span>`).join("");

  return `<div class="bar-chart">
    <svg viewBox="0 0 ${width} ${chartHeight}" preserveAspectRatio="none" style="width:100%;height:${chartHeight}px;display:block" role="img" aria-label="${opts.ariaLabel || "Gráfico de barras"}">
      ${gridLines}
      ${bars}
    </svg>
    <div class="bar-chart-labels" style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));margin-top:4px;font-size:0.6875rem;font-weight:600;line-height:1.2;color:${COLORS.textMuted}">${labels}</div>
  </div>`;
}

/**
 * Line chart — polilínea con puntos.
 * @param {Array<{label:string, value:number}>} data
 * @param {Object} opts - { height, color }
 */
export function lineChart(data, opts = {}) {
  // v5.11.0: el SVG se estira a lo ancho (preserveAspectRatio="none"), así que los
  // textos dentro del SVG salían de ~2,5 px de alto y estirados, y los puntos eran
  // óvalos. Ahora: trazo uniforme (vector-effect), puntos redondos (trazo de largo
  // cero con punta redonda) y las fechas como texto HTML normal debajo del gráfico.
  const height = opts.height || 160;
  const color = opts.color || COLORS.primary;
  const width = 100;
  const padX = 2;
  const labelsH = 18;
  const chartHeight = Math.max(40, height - labelsH);
  const padY = 6;

  if (data.length === 0) return "";
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;
  const innerW = width - padX * 2;

  const points = data.map((d, i) => {
    const x = padX + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = padY + (1 - (d.value - minVal) / range) * (chartHeight - padY * 2);
    return { x, y, label: d.label, value: d.value };
  });
  const r2 = (n) => Math.round(n * 100) / 100;
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${r2(p.x)},${r2(p.y)}`).join(" ");
  const areaD = `${pathD} L${r2(points[points.length - 1].x)},${chartHeight} L${r2(points[0].x)},${chartHeight} Z`;
  const fmt = (v) => (opts.formatValue ? opts.formatValue(v) : v);

  // Puntos solo si no son demasiados (con 90/365 días quedaba una línea de bolitas)
  const dots = points.length <= 45 ? points.map((p) => `
    <path d="M${r2(p.x)},${r2(p.y)}h0" stroke="${color}" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke">
      <title>${p.label}: ${fmt(p.value)}</title>
    </path>`).join("") : "";

  const step = Math.max(1, Math.ceil(points.length / 6));
  const labels = points.map((p, i) => {
    const last = i === points.length - 1;
    if (i % step !== 0 && !last) return "";
    if (!last && points.length - 1 - i < step * 0.6) return ""; // no pisar la última fecha
    const shift = i === 0 ? "0" : last ? "-100%" : "-50%";
    return `<span style="position:absolute;left:${r2(p.x)}%;transform:translateX(${shift});white-space:nowrap">${p.label}</span>`;
  }).join("");

  return `<div class="line-chart">
    <svg viewBox="0 0 ${width} ${chartHeight}" preserveAspectRatio="none" style="width:100%;height:${chartHeight}px;display:block;overflow:visible" role="img" aria-label="${opts.ariaLabel || "Gráfico de línea"}">
      <path d="${areaD}" fill="${color}" opacity="0.12"/>
      <path d="${pathD}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      ${dots}
    </svg>
    <div class="line-chart-labels" style="position:relative;height:${labelsH - 4}px;margin-top:4px;font-size:0.6875rem;line-height:1;color:${COLORS.textMuted}">${labels}</div>
  </div>`;
}

/**
 * Sparkline — micro-tendencia para KPI cards (sin ejes).
 * v5.4.0: puntos con <title> (fecha/valor al hover o toque) si se pasan labels.
 * @param {Array<number>} values
 * @param {Object} opts - { color, height, labels, formatValue }
 */
export function sparkline(values, opts = {}) {
  const height = opts.height || 36;
  const color = opts.color || COLORS.primary;
  const width = 100;
  const padding = 3;
  const data = (values || []).filter((v) => typeof v === "number" && !isNaN(v));
  if (data.length < 2) return "";

  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;
  const chartH = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - minVal) / range) * chartH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const pathD = `M${points.join(" L")}`;
  // v5.9.0: antes usaba el par "x,y" completo → "L97.00,17.04,30" (path inválido,
  // el relleno no se dibujaba y la consola mostraba errores). Solo va la x.
  const firstX = points[0].split(",")[0];
  const lastX = points[points.length - 1].split(",")[0];
  const areaD = `${pathD} L${lastX},${height} L${firstX},${height} Z`;

  // Puntos interactivos: muestran label (fecha) y valor al hover/toque
  const fmt = opts.formatValue || ((v) => v);
  const dots = data.map((v, i) => {
    const [x, y] = points[i].split(",");
    const label = opts.labels?.[i] != null ? `${opts.labels[i]}: ` : "";
    // Punto redondo aunque el SVG se estire (preserveAspectRatio="none"): trazo de
    // longitud cero con extremo redondo y grosor fijo en píxeles (antes eran óvalos).
    return `<path d="M${x},${y}h0" stroke="${color}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.9"><title>${label}${fmt(v)}</title></path>`;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block" aria-hidden="true">
    <path d="${areaD}" fill="${color}" opacity="0.12"/>
    <path d="${pathD}" stroke="${color}" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${dots}
  </svg>`;
}

/**
 * Donut chart — muestra proporciones.
 * @param {Array<{label:string, value:number, color?:string}>} data
 * @param {Object} opts - { size, thickness, total }
 */
export function donutChart(data, opts = {}) {
  const size = opts.size || 120;
  const thickness = opts.thickness || 12;
  const total = opts.total || data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;
  const segments = data.map((d, i) => {
    const value = d.value || 0;
    if (value === 0) return "";
    const fraction = value / total;
    const dash = fraction * circumference;
    const color = d.color || Object.values(COLORS)[i % Object.values(COLORS).length];
    const seg = `
      <circle cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="${color}" stroke-width="${thickness}"
        stroke-dasharray="${dash} ${circumference - dash}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${center} ${center})">
        <title>${d.label}: ${value} (${Math.round(fraction * 100)}%)</title>
      </circle>
    `;
    offset += dash;
    return seg;
  }).join("");

  // v5.11.0: el texto del centro se medía como si el gráfico fuera de 100 unidades
  // (7–8 px, ilegible). Ahora escala con el tamaño y se achica si la cifra es larga.
  const label = String(opts.centerLabel || "");
  const inner = (radius - thickness / 2) * 2;
  const fsMain = Math.max(9, Math.min(Math.round(size * 0.15), Math.floor((inner * 0.86) / Math.max(1, label.length * 0.6))));
  const fsSub = Math.max(9, Math.round(size * 0.08));
  const yMain = center + (opts.centerSubLabel ? fsMain * 0.18 : fsMain * 0.36);
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;display:block" role="img" aria-label="${label} ${opts.centerSubLabel || ""}">
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${COLORS.bgSoft}" stroke-width="${thickness}"/>
    ${segments}
    <text x="${center}" y="${yMain}" text-anchor="middle" font-size="${fsMain}" font-weight="bold" fill="var(--text)">${label}</text>
    ${opts.centerSubLabel ? `<text x="${center}" y="${yMain + fsSub + 2}" text-anchor="middle" font-size="${fsSub}" fill="${COLORS.textMuted}">${opts.centerSubLabel}</text>` : ""}
  </svg>`;
}

/**
 * Legend — lista de colores + labels.
 */
export function legend(items) {
  return `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;font-size:0.75rem">
    ${items.map((it) => `
      <div style="display:flex;align-items:center;gap:0.375rem">
        <span style="width:0.625rem;height:0.625rem;border-radius:0.125rem;background:${it.color}"></span>
        <span style="color:var(--text-soft)">${it.label}</span>
        ${it.value != null ? `<span style="color:var(--text-muted);font-weight:600">${it.value}</span>` : ""}
      </div>
    `).join("")}
  </div>`;
}

export { COLORS };

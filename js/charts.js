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
  const height = opts.height || 160;
  const maxVal = opts.max || Math.max(...data.map((d) => d.value), 1);
  const width = 100;
  const barWidth = data.length > 0 ? (width / data.length) * 0.7 : 0;
  const gap = data.length > 0 ? (width / data.length) * 0.3 : 0;
  const padding = 4;
  const chartHeight = height - 24; // leave space for labels

  const bars = data.map((d, i) => {
    const barHeight = (d.value / maxVal) * (chartHeight - padding * 2);
    const x = i * (barWidth + gap) + gap / 2;
    const y = chartHeight - barHeight;
    const color = d.color || COLORS.primary;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="1" fill="${color}" opacity="0.85">
        <title>${d.label}: ${opts.formatValue ? opts.formatValue(d.value) : d.value}</title>
      </rect>
      <text x="${x + barWidth / 2}" y="${chartHeight + 4}" text-anchor="middle" font-size="2.5" fill="${COLORS.textMuted}">${d.label}</text>
    `;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">
    ${bars}
  </svg>`;
}

/**
 * Line chart — polilínea con puntos.
 * @param {Array<{label:string, value:number}>} data
 * @param {Object} opts - { height, color }
 */
export function lineChart(data, opts = {}) {
  const height = opts.height || 160;
  const color = opts.color || COLORS.primary;
  const width = 100;
  const padding = 4;
  const chartHeight = height - 24;
  const chartWidth = width - padding * 2;

  if (data.length === 0) return "";
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padding + (data.length === 1 ? chartWidth / 2 : (i / (data.length - 1)) * chartWidth);
    const y = chartHeight - ((d.value - minVal) / range) * (chartHeight - padding * 2);
    return { x, y, label: d.label, value: d.value };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L${points[points.length - 1].x},${chartHeight} L${points[0].x},${chartHeight} Z`;

  const dots = points.map((p) => `
    <circle cx="${p.x}" cy="${p.y}" r="1.2" fill="${color}" stroke="var(--bg)" stroke-width="0.5">
      <title>${p.label}: ${opts.formatValue ? opts.formatValue(p.value) : p.value}</title>
    </circle>
  `).join("");

  const labels = points.map((p, i) => {
    // Only show every Nth label to avoid clutter
    const step = Math.max(1, Math.floor(points.length / 6));
    if (i % step !== 0) return "";
    return `<text x="${p.x}" y="${height - 2}" text-anchor="middle" font-size="2.5" fill="${COLORS.textMuted}">${p.label}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">
    <path d="${areaD}" fill="${color}" opacity="0.1"/>
    <path d="${pathD}" stroke="${color}" stroke-width="0.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
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

  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;display:block">
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${COLORS.bgSoft}" stroke-width="${thickness}"/>
    ${segments}
    <text x="${center}" y="${center - 2}" text-anchor="middle" font-size="6" font-weight="bold" fill="var(--text)">${opts.centerLabel || ""}</text>
    <text x="${center}" y="${center + 6}" text-anchor="middle" font-size="3" fill="${COLORS.textMuted}">${opts.centerSubLabel || ""}</text>
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

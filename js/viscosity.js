// =====================================================
// Detección automática de viscosidad desde el nombre del producto
// =====================================================
// Los productos MANNOL ya traen la viscosidad en el nombre
// ("MANNOL 5W-30 Longlife", "MANNOL ATF Dexron III", ...).
// Esta utilidad extrae la viscosidad del nombre para rellenar
// el campo automáticamente en el formulario de productos y no
// tener que escribirla dos veces.
// =====================================================

/**
 * Detecta la viscosidad dentro de un nombre de producto.
 *
 * Patrones reconocidos (por orden de prioridad):
 *   1. SAE multigrado:  5W-30, 10W40, 15W/40, 75W-90...
 *   2. SAE monogrado:   SAE 30, SAE 90, SAE 140...
 *   3. ISO VG (industrial): ISO VG 46, ISO 68...
 *   4. ATF (transmisión automática): "ATF" en el nombre
 *   5. DOT (líquido de frenos): DOT 3, DOT 4, DOT 5.1...
 *
 * @param {string} name - nombre del producto (tal cual, mayúsculas o minúsculas)
 * @returns {string|null} viscosidad normalizada (ej. "5W-30") o null si no hay
 */
export function detectViscosityFromName(name) {
  if (!name || typeof name !== "string") return null;
  const n = name.toUpperCase();

  // 1) Multigrado: 5W-30 / 10W40 / 15W/40 (también 5W 30)
  let m = n.match(/\b(\d{1,2}\s?W\s?[-\/]?\s?\d{2,3})\b/);
  if (m) return normalizeMultigrade(m[1]);

  // 2) Monogrado con prefijo SAE: SAE 30 / SAE 90
  m = n.match(/\bSAE\s?(\d{2,3})\b/);
  if (m) return `SAE ${m[1]}`;

  // 3) ISO VG (aceites hidráulicos/industriales)
  m = n.match(/\bISO\s?(?:VG\s?)?(\d{2,3})\b/);
  if (m) return `ISO VG ${m[1]}`;

  // 4) ATF (transmisión automática)
  if (/\bATF\b/.test(n)) return "ATF";

  // 5) DOT (líquido de frenos): DOT 3 / DOT 4 / DOT 5.1
  m = n.match(/\bDOT\s?([3-5](?:\.1)?)\b/);
  if (m) return `DOT ${m[1]}`;

  return null;
}

/**
 * Normaliza un multigrado: "10W40" → "10W-40", "15W/40" → "15W-40",
 * "5W 30" → "5W-30". Los valores ya normales quedan igual.
 * @param {string} raw
 * @returns {string}
 */
function normalizeMultigrade(raw) {
  const m = raw.toUpperCase().replace(/\s+/g, "").match(/^(\d{1,2})W(?:[-\/]?(\d{2,3}))?$/);
  if (!m) return raw.trim().toUpperCase();
  return m[2] ? `${m[1]}W-${m[2]}` : `${m[1]}W`;
}

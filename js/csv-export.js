// =====================================================
// CSV Export helper — generate CSV from array of objects
// =====================================================
// Usage:
//   import { exportToCSV } from "./csv-export.js";
//   exportToCSV("my-report", [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
//   → Downloads "my-report-2025-01-15.csv"
// =====================================================

// v5.39.2: neutralizar inyección de fórmulas al abrir el CSV en Excel o
// Google Sheets (hallazgo 10 de la revisión): una celda que empiece por
// = + - @ o tabulador podría ejecutarse como fórmula al abrir el archivo.
// Los números reales (con signo y decimales) pasan intactos; el resto de
// celdas sospechosas llevan un apóstrofe inicial que Excel interpreta como
// «esto es texto» y no muestra.
export function escapeCSV(value) {
  if (value == null) return "";
  let str = String(value);
  const looksLikeNumber = /^[-+]?\d+(?:[.,]\d+)?$/.test(str);
  if (!looksLikeNumber && /^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  // Quote if contains comma, quote, newline, or leading/trailing whitespace
  if (/[",\n\r]|^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export an array of objects as a CSV file download.
 * @param {string} filename - base filename (no extension)
 * @param {Array<Object>} rows - data rows
 * @param {Array<string>} [columns] - optional column order (defaults to Object.keys of first row)
 */
export function exportToCSV(filename, rows, columns) {
  if (!rows || rows.length === 0) {
    // Still create an empty CSV with headers if columns provided
    if (columns) {
      const csv = columns.join(",") + "\n";
      downloadCSV(filename, csv);
    }
    return;
  }

  const cols = columns || Object.keys(rows[0]);
  const header = cols.map(escapeCSV).join(",");
  const body = rows.map((row) =>
    cols.map((col) => escapeCSV(row[col])).join(",")
  ).join("\n");

  const csv = "\uFEFF" + header + "\n" + body; // BOM for Excel UTF-8
  downloadCSV(filename, csv);
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  // v5.35.0: fecha LOCAL (antes UTC: de noche salía el día siguiente) y sin
  // repetir «.csv» si el nombre ya lo trae
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const base = String(filename).replace(/\.csv$/i, "");
  a.href = url;
  a.download = `${base}-${date}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Export multiple CSVs as separate downloads (one per "apartado").
 * Cada apartado se descarga con un pequeño delay para que el navegador no los bloque.
 *
 * @param {Array<{filename: string, rows: Array<Object>, columns?: Array<string>}>} datasets
 * @param {string} prefix - prefijo común para los filenames (ej: "mannol-export")
 * @returns {Promise<number>} - cantidad de archivos descargados
 */
export async function exportMultipleCSVs(datasets, prefix = "mannol-export") {
  let count = 0;
  for (const ds of datasets) {
    if (!ds.rows || ds.rows.length === 0) continue;
    const filename = `${prefix}-${ds.filename}`;
    const cols = ds.columns || Object.keys(ds.rows[0]);
    const header = cols.map(escapeCSV).join(",");
    const body = ds.rows.map((row) =>
      cols.map((col) => escapeCSV(row[col])).join(",")
    ).join("\n");
    const csv = "\uFEFF" + header + "\n" + body;
    downloadCSV(filename, csv);
    count++;
    // Pequeño delay para no saturar el navegador
    await new Promise((r) => setTimeout(r, 300));
  }
  return count;
}

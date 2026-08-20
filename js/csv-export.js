// =====================================================
// CSV Export helper — generate CSV from array of objects
// =====================================================
// Usage:
//   import { exportToCSV } from "./csv-export.js";
//   exportToCSV("my-report", [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
//   → Downloads "my-report-2025-01-15.csv"
// =====================================================

function escapeCSV(value) {
  if (value == null) return "";
  const str = String(value);
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
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filename}-${date}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// =====================================================
// Data freshness — frescura de los datos vistos en pantalla (v5.17)
// =====================================================
// El service worker sirve la última copia guardada cuando no hay red (o el
// servidor tarda >6 s). Antes eso era invisible: se podía vender con un stock
// desactualizado sin saberlo. Aquí se guarda CUÁNDO llegaron por última vez
// datos reales (productos, stock de cada almacén) y el banner de estado lo
// muestra: «Sin conexión · stock de hace 12 min · 3 ventas pendientes».

const KEY = "mannol-data-ok-v1";

function readMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
}

/** Marca que los datos `name` (ej. "stock:<warehouseId>") llegaron AHORA. */
export function recordDataOk(name) {
  if (!name) return;
  const map = readMap();
  map[name] = Date.now();
  writeMap(map);
}

/** ms desde la última carga real de `name`, o null si nunca. */
export function getDataAgeMs(name) {
  const ts = readMap()[name];
  if (!ts) return null;
  const age = Date.now() - ts;
  return age >= 0 ? age : null;
}

/** "3 min" · "1 h 05 min" · "2 d" — para mostrar junto al dato. */
export function formatDataAge(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, "0")} min`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

/** Borra todas las marcas (p. ej. al cerrar sesión). */
export function clearDataFreshness() {
  try { localStorage.removeItem(KEY); } catch {}
}

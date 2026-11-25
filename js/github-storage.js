// =====================================================
// GitHub Storage — imágenes de productos en el repo de GitHub
// =====================================================
// ¿Por qué? Las imágenes son lo que más pesa. Si se guardan en
// Supabase Storage se agota el espacio del free tier (1 GB).
// Esta capa sube las imágenes a un repo de GitHub vía la API de
// Contents (https://docs.github.com/en/rest/repos/contents) y las
// sirve desde raw.githubusercontent.com (o el CDN que se configure).
//
// Requisitos (lo configura el admin en: Admin → Sistema → Almacenamiento):
//   1. Repo de GitHub (puede ser el mismo que publica la app en Pages).
//   2. Token fine-grained con permiso "Contents: Read and write".
//      → GitHub → Settings → Developer settings → Fine-grained tokens.
//   3. Guardar la config. Queda en localStorage del dispositivo.
//
// La config también puede vivir en js/github-config.js (opcional, para
// preconfigurar owner/repo sin token). localStorage tiene precedencia.
// =====================================================

const GITHUB_CONFIG_KEY = "mannol-github-config-v1";

const DEFAULT_CONFIG = {
  owner: "",
  repo: "",
  branch: "main",
  path: "product-images", // carpeta dentro del repo
  token: "",
  cdnBase: "", // opcional: p.ej. https://cdn.jsdelivr.net/gh/owner/repo@main
};

let _fileConfigLoaded = false;
let _fileConfig = null;

/**
 * Intenta cargar js/github-config.js (archivo opcional precomiteado).
 */
async function loadFileConfig() {
  if (_fileConfigLoaded) return _fileConfig;
  _fileConfigLoaded = true;
  try {
    const mod = await import("./github-config.js");
    if (mod && mod.githubConfig) _fileConfig = mod.githubConfig;
  } catch {
    // El archivo no existe — es opcional
  }
  return _fileConfig;
}

/**
 * Devuelve la config combinada (archivo < localStorage).
 * @returns {Promise<Object>}
 */
export async function getGitHubConfig() {
  let stored = {};
  try {
    const raw = localStorage.getItem(GITHUB_CONFIG_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch {
    stored = {};
  }
  const fileCfg = (await loadFileConfig()) || {};
  return { ...DEFAULT_CONFIG, ...fileCfg, ...stored };
}

/**
 * Guarda la config en localStorage (precede al archivo github-config.js).
 */
export async function saveGitHubConfig(cfg) {
  const current = await getGitHubConfig();
  const merged = { ...current, ...cfg };
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

/**
 * ¿Hay config suficiente para subir a GitHub?
 */
export async function isGitHubConfigured() {
  const cfg = await getGitHubConfig();
  return !!(
    cfg.owner && cfg.repo && cfg.token &&
    String(cfg.token).trim().length >= 20
  );
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function apiBase(cfg) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;
}

/**
 * Prueba la conexión: verifica acceso al repo y permiso de push.
 * @returns {Promise<{ok: boolean, message: string, canPush: boolean}>}
 */
export async function testGitHubConnection() {
  const cfg = await getGitHubConfig();
  if (!cfg.owner || !cfg.repo) {
    return { ok: false, message: "Faltan owner/repo", canPush: false };
  }
  if (!cfg.token) {
    return { ok: false, message: "Falta el token de acceso", canPush: false };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`,
      { headers: apiHeaders(cfg.token) }
    );
    if (res.status === 401) return { ok: false, message: "Token inválido o expirado (401)", canPush: false };
    if (res.status === 404) return { ok: false, message: "Repo no encontrado o sin acceso (404)", canPush: false };
    if (!res.ok) return { ok: false, message: `Error HTTP ${res.status}`, canPush: false };
    const data = await res.json();
    const canPush = !!data.permissions?.push;
    return {
      ok: true,
      message: `Conectado a ${data.full_name} (${data.private ? "privado" : "público"}) · ${canPush ? "permiso de escritura OK" : "SIN permiso de escritura — revisá el token"}`,
      canPush,
    };
  } catch (err) {
    return { ok: false, message: "Sin conexión con GitHub: " + (err.message || err), canPush: false };
  }
}

/**
 * Convierte un Blob a base64 (sin el prefijo data:).
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Sube un archivo (blob) a la carpeta configurada del repo.
 * @param {Blob} blob - contenido (ya convertido a WebP por image-upload.js)
 * @param {string} filename - nombre de archivo, p.ej. 1699999999-a1b2c3.webp
 * @returns {Promise<{url: string, sha: string, path: string}>}
 */
export async function uploadImageToGitHub(blob, filename) {
  const cfg = await getGitHubConfig();
  if (!(await isGitHubConfigured())) {
    throw new Error("GitHub no está configurado (Admin → Sistema → Almacenamiento)");
  }
  const dir = String(cfg.path || "").replace(/^\/+|\/+$/g, "");
  const filePath = dir ? `${dir}/${filename}` : filename;
  const content = await blobToBase64(blob);

  const res = await fetch(`${apiBase(cfg)}/${filePath}`, {
    method: "PUT",
    headers: apiHeaders(cfg.token),
    body: JSON.stringify({
      message: `MANNOL POS: imagen ${filename}`,
      content,
      branch: cfg.branch || "main",
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Token sin permiso de escritura (Contents: Read and write)");
  }
  if (res.status === 409) {
    throw new Error("Conflicto: el archivo ya existía con otro SHA");
  }
  if (!res.ok) {
    let msg = `Error HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg += ` — ${j.message}`;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  // URL pública final para mostrar la imagen:
  //  - cdnBase configurado (ej: jsDelivr) si existe
  //  - si no, raw.githubusercontent.com (sirve al instante en repos públicos)
  const branch = cfg.branch || "main";
  const url = cfg.cdnBase
    ? `${cfg.cdnBase.replace(/\/+$/, "")}/${filePath}`
    : `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${branch}/${filePath}`;

  return { url, sha: data.content?.sha, path: filePath };
}

/**
 * Parsea una URL de imagen de GitHub (raw.githubusercontent o jsDelivr)
 * a { owner, repo, branch, filePath }. Devuelve null si no es de GitHub.
 */
function parseGitHubUrl(url) {
  try {
    let u = new URL(url);
    // raw.githubusercontent.com/{owner}/{repo}/{branch}/{path...}
    let m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:raw\/)?([^/]+)\/(.+)$/);
    if (u.hostname === "raw.githubusercontent.com" && m) {
      return { owner: m[1], repo: m[2], branch: m[3], filePath: m[4] };
    }
    // cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path...}
    if (u.hostname === "cdn.jsdelivr.net" && u.pathname.startsWith("/gh/")) {
      const rest = u.pathname.slice(4); // /owner/repo@branch/path
      const m2 = rest.match(/^\/([^/]+)\/([^/@]+)@?([^/]*)\/(.+)$/);
      if (m2) return { owner: m2[1], repo: m2[2], branch: m2[3] || "main", filePath: m2[4] };
    }
  } catch {}
  return null;
}

/**
 * Borra una imagen del repo a partir de su URL pública (best-effort).
 * Si la URL no es de GitHub o falla, no lanza (solo avisa por consola).
 */
export async function deleteImageFromGitHub(imageUrl) {
  try {
    const parsed = parseGitHubUrl(imageUrl);
    if (!parsed) return false;
    const cfg = await getGitHubConfig();
    if (!cfg.token || cfg.owner !== parsed.owner || cfg.repo !== parsed.repo) {
      console.warn("[GitHubStorage] No hay token para borrar:", imageUrl);
      return false;
    }
    // 1. Obtener el SHA actual del archivo
    const head = await fetch(
      `${apiBase(cfg)}/${parsed.filePath}?ref=${parsed.branch}`,
      { headers: apiHeaders(cfg.token) }
    );
    if (!head.ok) return false;
    const headData = await head.json();
    if (!headData?.sha) return false;
    // 2. Borrar con el SHA
    const del = await fetch(`${apiBase(cfg)}/${parsed.filePath}`, {
      method: "DELETE",
      headers: apiHeaders(cfg.token),
      body: JSON.stringify({
        message: `MANNOL POS: borrar ${parsed.filePath}`,
        sha: headData.sha,
        branch: parsed.branch,
      }),
    });
    return del.ok;
  } catch (err) {
    console.warn("[GitHubStorage] deleteImageFromGitHub falló:", err);
    return false;
  }
}

/**
 * ¿Esta URL apunta a GitHub (raw o jsDelivr)?
 */
export function isGitHubUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("raw.githubusercontent.com") ||
         url.includes("cdn.jsdelivr.net/gh/") ||
         url.includes("githubusercontent.com");
}

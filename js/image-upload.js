// =====================================================
// Image upload — convierte a WebP con Canvas API
// =====================================================
//
// El usuario sube un JPG/PNG/etc. desde su dispositivo.
// El navegador lo carga como blob, lo dibuja en un canvas,
// y exporta como WebP (quality 82, max 1200px).
// Luego se sube a Firebase Storage (si configurado) o se
// guarda como data URL en modo demo.
//
// El archivo original (JPG/PNG) NUNCA se sube — solo el WebP.
// =====================================================

import { getFirebase } from "./firebase.js";
import { toast } from "./ui.js";

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 0.82;

/**
 * Convierte un File de imagen a WebP usando Canvas.
 * Redimensiona si excede MAX_WIDTH/HEIGHT.
 * Retorna un Blob WebP.
 */
export async function convertToWebP(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo no es una imagen");
  }

  // Crear un objeto URL temporal para cargar la imagen
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(objectUrl);

    // Calcular dimensiones manteniendo aspect ratio
    let { width, height } = img;
    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    // Dibujar en canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    // Exportar como WebP
    const webpBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Error al convertir a WebP"));
        },
        "image/webp",
        WEBP_QUALITY
      );
    });

    return webpBlob;
  } finally {
    // Liberar memoria del objeto URL temporal
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Carga una imagen desde una URL.
 * Retorna una Promise<HTMLImageElement>.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/**
 * Sube una imagen a Firebase Storage y devuelve la URL pública.
 * Si Firebase no está configurado (modo demo), devuelve un data URL.
 *
 * @param {File} file - Archivo de imagen subido por el usuario
 * @param {string} path - Ruta en Storage (ej: "products/product-123.webp")
 * @returns {Promise<{url: string, originalSize: number, webpSize: number, savedPct: number}>}
 */
export async function uploadImageAsWebP(file, path = "products") {
  const originalSize = file.size;

  // 1. Convertir a WebP
  const webpBlob = await convertToWebP(file);
  const webpSize = webpBlob.size;
  const savedPct = Math.round((1 - webpSize / originalSize) * 100);

  // 2. Generar nombre único: {path}/{timestamp}-{random}.webp
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const fullPath = `${path}/${filename}`;

  // 3. Intentar subir a Firebase Storage
  const f = await getFirebase();
  if (f && f.storage) {
    try {
      const { ref, uploadBytes, getDownloadURL } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js"
      );
      const storageRef = ref(f.storage, fullPath);
      const metadata = { contentType: "image/webp" };
      await uploadBytes(storageRef, webpBlob, metadata);
      const url = await getDownloadURL(storageRef);
      console.info(`[ImageUpload] Subido a Storage: ${fullPath} (${formatSize(webpSize)})`);
      return { url, originalSize, webpSize, savedPct };
    } catch (err) {
      console.error("[ImageUpload] Error subiendo a Storage:", err);
      throw new Error("Error al subir imagen a Firebase Storage: " + err.message);
    }
  }

  // 4. Modo demo: convertir a data URL (base64)
  const dataUrl = await blobToDataURL(webpBlob);
  console.info(`[ImageUpload] Modo demo — data URL (${formatSize(webpSize)})`);
  return { url: dataUrl, originalSize, webpSize, savedPct };
}

/**
 * Convierte un Blob a data URL (base64).
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Error al leer archivo"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Formatea bytes a string legible (KB, MB).
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Crea un input de archivo oculto y dispara el selector.
 * Retorna una Promise que resuelve con el File seleccionado.
 */
export function pickImageFile(accept = "image/*") {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      document.body.removeChild(input);
      if (file) resolve(file);
      else reject(new Error("No se seleccionó ningún archivo"));
    });

    // Si el usuario cancela, removemos el input después de un tiempo
    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    }, 60000);

    input.click();
  });
}

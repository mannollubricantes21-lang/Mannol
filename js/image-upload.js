// =====================================================
// Image upload — convierte a WebP con Canvas API
// =====================================================
//
// El usuario sube un JPG/PNG/etc. desde su dispositivo.
// El navegador lo carga como blob, lo dibuja en un canvas,
// y exporta como WebP (quality 82, max 1200px).
// Luego se sube a Supabase Storage (si configurado) o se
// guarda como data URL en modo demo.
//
// El archivo original (JPG/PNG) NUNCA se sube — solo el WebP.
// =====================================================

import { getSupabase } from "./supabase.js";
import { toast } from "./ui.js";

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 0.82;

/**
 * Convierte un File de imagen a WebP usando Canvas.
 * Redimensiona si excede MAX_WIDTH/HEIGHT.
 * Si tras la conversión el WebP supera 5MB, reintenta con calidad decreciente.
 * Retorna un Blob WebP que SIEMPRE es <= 5MB (o lanza error).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — Supabase Storage bucket limit
const QUALITY_FALLBACKS = [0.82, 0.7, 0.6, 0.5, 0.4];

export async function convertToWebP(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo no es una imagen");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(objectUrl);

    // Intentar varias calidades hasta que el WebP quepa en 5MB
    let lastError = null;
    for (const quality of QUALITY_FALLBACKS) {
      const webpBlob = await tryConvert(img, quality);
      if (webpBlob && webpBlob.size <= MAX_FILE_SIZE) {
        return webpBlob;
      }
      lastError = new Error(`WebP con calidad ${quality} pesa ${(webpBlob.size / 1024 / 1024).toFixed(2)}MB — aún excede 5MB`);
    }
    throw new Error(
      `No se pudo reducir la imagen por debajo de 5MB tras ${QUALITY_FALLBACKS.length} intentos. ` +
      `La imagen original probablemente es demasiado grande o compleja.`
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Helper: convierte la imagen a WebP con una calidad dada.
 */
async function tryConvert(img, quality) {
  let { width, height } = img;
  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Error al convertir a WebP"));
      },
      "image/webp",
      quality
    );
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/**
 * Sube una imagen a Supabase Storage y devuelve la URL pública.
 * Si Supabase no está configurado (modo demo), devuelve un data URL.
 *
 * @param {File} file - Archivo de imagen subido por el usuario
 * @param {string} bucket - Bucket en Storage ("products" o "images")
 * @returns {Promise<{url: string, originalSize: number, webpSize: number, savedPct: number}>}
 */
export async function uploadImageAsWebP(file, bucket = "products") {
  const originalSize = file.size;

  // 1. Convertir a WebP
  const webpBlob = await convertToWebP(file);
  const webpSize = webpBlob.size;
  const savedPct = Math.round((1 - webpSize / originalSize) * 100);

  // 2. Generar nombre único: {timestamp}-{random}.webp
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const fullPath = `${filename}`;

  // 3. Intentar subir a Supabase Storage
  const s = await getSupabase();
  if (s && s.storage) {
    try {
      const { error: uploadError } = await s.storage
        .from(bucket)
        .upload(fullPath, webpBlob, {
          contentType: "image/webp",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = s.storage.from(bucket).getPublicUrl(fullPath);
      const url = urlData?.publicUrl;
      if (!url) throw new Error("No se pudo obtener URL pública");

      console.info(`[ImageUpload] Subido a Supabase Storage: ${bucket}/${fullPath} (${formatSize(webpSize)})`);
      return { url, originalSize, webpSize, savedPct };
    } catch (err) {
      console.error("[ImageUpload] Error subiendo a Storage:", err);
      throw new Error("Error al subir imagen a Supabase Storage: " + (err.message || err));
    }
  }

  // 4. Modo demo: convertir a data URL (base64)
  const dataUrl = await blobToDataURL(webpBlob);
  console.info(`[ImageUpload] Modo demo — data URL (${formatSize(webpSize)})`);
  return { url: dataUrl, originalSize, webpSize, savedPct };
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Error al leer archivo"));
    reader.readAsDataURL(blob);
  });
}

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

    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    }, 60000);

    input.click();
  });
}

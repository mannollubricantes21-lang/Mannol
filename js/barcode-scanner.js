// =====================================================
// MANNOL POS — Escáner de códigos de barras con la cámara (v5.10.0)
// =====================================================
// Motores, en este orden:
//   1) Lector nativo del teléfono (BarcodeDetector — Chrome en Android):
//      sin descargas, rápido y sin conexión.
//   2) Respaldo ZXing (js/zxing.min.js, licencia MIT) que se carga SOLO si el
//      navegador no trae lector nativo (iPhone, algunos Android). El service
//      worker lo guarda en caché la primera vez → después funciona offline.
//   3) Siempre se puede escribir el código a mano (botón "Escribir código").
//
// Uso:
//   openScanner({
//     title: "Escanear productos",
//     continuous: true,                 // seguir escaneando tras cada lectura
//     onCode: (code) => ({ ok: true, message: "+1 Energy 5W-30" }),
//   });
//   onCode puede devolver { ok:false, message } para avisar (no cierra).
// =====================================================
import { icon, esc } from "./ui.js";

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
const SAME_CODE_PAUSE_MS = 1800; // no repetir el mismo código mientras sigue delante de la cámara
const FRAME_INTERVAL_MS = 110;   // ~9 lecturas por segundo como máximo

let zxingPromise = null;

/** ¿Hay cámara utilizable en este navegador? (HTTPS + getUserMedia) */
export function canUseCamera() {
  try {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;
  } catch {
    return false;
  }
}

function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("./zxing.min.js", import.meta.url).href;
      s.async = true;
      s.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error("Lector no disponible")));
      s.onerror = () => {
        zxingPromise = null;
        s.remove();
        reject(new Error("No se pudo cargar el lector"));
      };
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}

async function createEngine() {
  // 1) Nativo
  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length) {
        const detector = new window.BarcodeDetector({ formats });
        return {
          name: "nativo",
          async detect(video) {
            const codes = await detector.detect(video);
            const c = codes.find((x) => x && x.rawValue);
            return c ? { text: c.rawValue, format: c.format } : null;
          },
        };
      }
    } catch {
      /* sin formatos (p. ej. Android sin Google Play) → ZXing */
    }
  }

  // 2) ZXing
  const ZX = await loadZXing();
  const F = ZX.BarcodeFormat;
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  const reader = new ZX.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  return {
    name: "zxing",
    async detect(video, frameNo) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return null;
      // Fotogramas pares: zona central (la del recuadro). Impares: imagen completa.
      const crop = frameNo % 2 === 0;
      const cw = crop ? Math.round(vw * 0.86) : vw;
      const ch = crop ? Math.round(vh * 0.6) : vh;
      const sx = Math.round((vw - cw) / 2);
      const sy = Math.round((vh - ch) / 2);
      const scale = Math.min(1, 800 / cw);
      canvas.width = Math.max(1, Math.round(cw * scale));
      canvas.height = Math.max(1, Math.round(ch * scale));
      ctx.drawImage(video, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
        lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8; // luminancia
      }
      try {
        const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(lum, width, height)));
        const r = reader.decodeWithState(bitmap);
        return { text: r.getText(), format: String(F[r.getBarcodeFormat()] || "").toLowerCase() };
      } catch {
        return null; // nada legible en este fotograma → seguir
      }
    },
  };
}

/**
 * Abre el escáner a pantalla completa.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.hint]
 * @param {boolean} [opts.continuous] - true: sigue escaneando (venta); false: cierra al leer
 * @param {(code: string, format: string) => (void|{ok?: boolean, message?: string}|Promise<any>)} opts.onCode
 * @param {() => void} [opts.onClose]
 * @returns {{ close: () => void }}
 */
export function openScanner({ title = "Escanear código", hint = "Apunta al código de barras", continuous = false, onCode, onClose } = {}) {
  const prevFocus = document.activeElement;
  let stopped = false;
  let stream = null;
  let engine = null;
  let timer = null;
  let busy = false;
  let frameNo = 0;
  let lastCode = "";
  let lastAt = 0;
  let okCount = 0;
  let torchOn = false;

  // Sonido de confirmación: el AudioContext se crea dentro del toque que abre el escáner
  let audio = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audio = new AC();
  } catch {}

  const overlay = document.createElement("div");
  overlay.className = "scanner-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);
  overlay.innerHTML = `
    <div class="scanner-top">
      <div class="scanner-title">${icon("scan", 18)}<span>${esc(title)}</span>${continuous ? '<span class="scanner-count" hidden></span>' : ""}</div>
      <button type="button" class="scanner-btn scanner-close" aria-label="Cerrar escáner">${icon("x", 22)}</button>
    </div>
    <div class="scanner-stage">
      <video class="scanner-video" playsinline muted autoplay></video>
      <div class="scanner-frame" aria-hidden="true"><span class="scanner-line"></span></div>
    </div>
    <div class="scanner-bottom">
      <div class="scanner-status" role="status" aria-live="polite">Abriendo la cámara…</div>
      <form class="scanner-manual" hidden>
        <input class="input" name="code" placeholder="Código de barras o SKU" autocomplete="off" autocapitalize="characters" enterkeyhint="search" aria-label="Código de barras o SKU" />
        <button class="btn btn-primary" type="submit">Buscar</button>
      </form>
      <div class="scanner-actions">
        <button type="button" class="scanner-btn scanner-torch" hidden aria-pressed="false">${icon("flashlight", 18)}<span>Linterna</span></button>
        <button type="button" class="scanner-btn scanner-type">${icon("keyboard", 18)}<span>Escribir código</span></button>
        ${continuous ? `<button type="button" class="scanner-btn scanner-done">${icon("check", 18)}<span>Listo</span></button>` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.documentElement.classList.add("scanner-open");

  const $ = (sel) => overlay.querySelector(sel);
  const video = $(".scanner-video");
  const frame = $(".scanner-frame");
  const status = $(".scanner-status");
  const manual = $(".scanner-manual");
  const torchBtn = $(".scanner-torch");
  const countEl = $(".scanner-count");

  function setStatus(msg, kind = "") {
    status.textContent = msg;
    status.classList.toggle("is-ok", kind === "ok");
    status.classList.toggle("is-error", kind === "error");
  }

  function showManual(focus = true) {
    manual.hidden = false;
    $(".scanner-type").hidden = true;
    if (focus) setTimeout(() => manual.querySelector("input").focus(), 50);
  }

  function feedback(ok) {
    try { navigator.vibrate?.(ok ? 40 : [70, 60, 70]); } catch {}
    if (audio) {
      try {
        if (audio.state === "suspended") audio.resume();
        const t = audio.currentTime;
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = "sine";
        o.frequency.value = ok ? 1046 : 330;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.12 : 0.28));
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + 0.3);
      } catch {}
    }
    frame.classList.remove("is-ok", "is-error");
    void frame.offsetWidth; // reinicia la animación
    frame.classList.add(ok ? "is-ok" : "is-error");
  }

  async function handle(code, format, source) {
    const text = String(code || "").trim();
    if (!text || stopped) return;
    const now = Date.now();
    if (source === "camera" && text === lastCode && now - lastAt < SAME_CODE_PAUSE_MS) return;
    lastCode = text;
    lastAt = now;
    let result;
    try {
      result = await onCode?.(text, format || source);
    } catch (err) {
      result = { ok: false, message: err?.message || "Error al procesar el código" };
    }
    const ok = !(result && result.ok === false);
    feedback(ok);
    setStatus((result && result.message) || (ok ? `Código leído: ${text}` : `Código ${text}`), ok ? "ok" : "error");
    if (ok) {
      okCount++;
      if (countEl) {
        countEl.hidden = false;
        countEl.textContent = `${okCount} ✓`;
      }
      if (!continuous) setTimeout(close, 350);
    }
  }

  async function tick() {
    if (stopped) return;
    if (!busy && engine && video.readyState >= 2) {
      busy = true;
      try {
        const res = await engine.detect(video, frameNo++);
        if (res && res.text) await handle(res.text, res.format, "camera");
      } catch {}
      busy = false;
    }
    if (!stopped) timer = setTimeout(tick, FRAME_INTERVAL_MS);
  }

  function close() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { audio?.close(); } catch {}
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVisibility);
    overlay.remove();
    document.documentElement.classList.remove("scanner-open");
    try { if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch {}
    onClose?.();
  }

  // Escape cierra SOLO el escáner (fase de captura: no llega al modal de abajo)
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  }
  function onVisibility() {
    if (document.hidden) close(); // apagar la cámara si se cambia de app
  }
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVisibility);

  $(".scanner-close").addEventListener("click", close);
  $(".scanner-done")?.addEventListener("click", close);
  $(".scanner-type").addEventListener("click", () => showManual(true));
  manual.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = manual.querySelector("input");
    const value = input.value;
    input.value = "";
    handle(value, "manual", "manual");
  });
  torchBtn.addEventListener("click", async () => {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      torchOn = !torchOn;
      torchBtn.setAttribute("aria-pressed", String(torchOn));
    } catch {}
  });
  setTimeout(() => { if (!stopped) $(".scanner-close").focus({ preventScroll: true }); }, 30);

  // ---- Arranque: cámara + motor ----
  (async () => {
    if (!canUseCamera()) {
      setStatus("Este navegador no permite usar la cámara. Escribe el código.", "error");
      showManual(false);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (err) {
      const name = err?.name || "";
      setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Sin permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No se encontró una cámara. Escribe el código."
            : "No se pudo abrir la cámara. Escribe el código.",
        "error"
      );
      showManual(false);
      return;
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch {}

    try {
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities ? track.getCapabilities() : {};
      if (caps && caps.torch) torchBtn.hidden = false;
    } catch {}

    try {
      engine = await createEngine();
    } catch {
      setStatus("El lector necesita conexión la primera vez. Escribe el código o inténtalo con internet.", "error");
      showManual(false);
      return;
    }
    if (stopped) return;
    overlay.dataset.engine = engine.name;
    setStatus(hint);
    tick();
  })();

  return { close };
}

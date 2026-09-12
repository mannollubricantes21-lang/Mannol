// =====================================================
// Versión de la app — única fuente de verdad
// =====================================================
// Se muestra en el pie del menú lateral (drawer) para poder
// verificar de un vistazo qué build está cargada en el
// dispositivo. Al publicar una nueva versión, actualizar
// APP_VERSION y APP_BUILD aquí (y el CACHE_VERSION de sw.js).
// =====================================================

export const APP_VERSION = "5.1.4";
export const APP_BUILD = "2026-09-12";
export const APP_LABEL = `MANNOL POS v${APP_VERSION} · build ${APP_BUILD}`;

console.info(`[MANNOL] ${APP_LABEL}`);

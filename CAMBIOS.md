# 📦 MANNOL POS — Actualizaciones aplicadas

## 🆕 Archivos nuevos añadidos (v5.0.0)

| # | Archivo | Tamaño | Descripción |
|---|---------|--------|-------------|
| 1 | `setup.html` | 3 KB | Página standalone del asistente de configuración de Supabase |
| 2 | `js/setup-wizard.js` | 54 KB | Lógica del wizard: 7 pasos guiados, copiar SQL, test de conexión en vivo, generación dinámica del SQL del admin, validación de credenciales, descarga de `supabase-config.js` |
| 3 | `css/setup-wizard.css` | 16 KB | Estilos del wizard (mismo sistema de diseño OKLCH esmeralda + dark mode, responsive móvil) |

## ✏️ Archivos modificados (v5.0.0)

| # | Archivo | Líneas | Cambio |
|---|---------|--------|--------|
| 1 | `js/supabase.js` | +104 | Soporte de configuración desde `localStorage` (clave `mannol-supabase-config-v1`) además del archivo. Nuevas funciones exportadas: `getStoredSupabaseConfig()`, `saveStoredSupabaseConfig()`, `clearStoredSupabaseConfig()`, `SUPABASE_CONFIG_STORAGE_KEY`. localStorage toma **precedencia** sobre el archivo (intención más reciente del usuario). |
| 2 | `js/views/home.js` | +44 | Importa `isSupabaseConfiguredAsync` y muestra banner verde "Conecta MANNOL con Supabase" cuando no está configurado, con botón directo al wizard. |
| 3 | `index.html` | +6 | Enlace al wizard (`setup.html`) en la pantalla de error de bootstrap. |

## 🐛 Fix en v5.0.1 — Aceptar nuevo formato de API key de Supabase

Supabase cambió recientemente el formato de las API keys en proyectos nuevos. Antes todas las anon keys eran JWTs empezando con `eyJ...`, pero los proyectos creados después de ~2024 usan el nuevo formato `sb_publish_...`.

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `js/setup-wizard.js` | `isValidAnonKey()` ahora acepta ambos formatos (`sb_publish_` y `eyJ`). Nueva función `isSecretKey()` detecta si alguien pega `sb_secret_` por error y muestra warning rojo. Actualizado el placeholder, hint y mensaje de error del paso 5. |

**Causa:** El usuario con un proyecto nuevo de Supabase no podía pasar la validación porque su anon key empezaba con `sb_publish_` en lugar de `eyJ`.

## 🧹 Archivos no tocados

Todos los demás archivos del repo se mantienen idénticos al upstream (`main`):
- `js/db.js`, `js/auth.js`, `js/image-upload.js`, `js/app.js`, `js/admin-app.js`
- `js/views/*.js` (14 vistas: home, dashboard, sales, stock, etc.)
- `supabase/*.sql` (schema, policies, seed, lifecycle-cleanup)
- `admin.html`, `css/styles.css`, `sw.js`, `manifest.webmanifest`, etc.

## ✅ Tests realizados

Probado con navegador headless (agent-browser):
- ✅ Wizard carga sin errores en consola
- ✅ Navegación entre los 7 pasos funciona
- ✅ Las 3 pestañas SQL cargan contenido (schema: 16,078 chars, policies: 23,489 chars, seed: 10,845 chars)
- ✅ Botón Copy funciona en cada pestaña
- ✅ El SQL del admin se actualiza dinámicamente al pegar el UUID
- ✅ Validación de credenciales: alerta roja para inválidas, verde para válidas
- ✅ Guardar credenciales las persiste en `localStorage`
- ✅ Auto-avanza al siguiente paso tras guardar
- ✅ Banner aparece/desaparece correctamente en home según estado
- ✅ Modo dark funciona
- ✅ Responsive móvil (390×844) funciona
- ✅ La app sigue funcionando en modo demo cuando no hay configuración

12 capturas de verificación disponibles en `/home/z/my-project/download/`:
- `wizard-step1-welcome.png` … `wizard-step7-done.png` (7 pasos del wizard)
- `wizard-step1-dark.png` (modo dark)
- `wizard-mobile-iphone.png`, `wizard-mobile-sql.png` (responsive móvil)
- `app-home-banner-shown.png` (banner en home sin configurar)
- `app-home-after-config.png` (home con Supabase configurado, sin banner)

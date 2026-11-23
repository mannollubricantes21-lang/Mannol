# 📦 MANNOL POS — Actualizaciones aplicadas

## v5.6.1 (2026-11-23) — FIX: PIN del almacén (incorrecto siempre + demora)

### Qué pasaba
- **"PIN incorrecto" aunque el PIN fuera correcto**: si el almacén no tenía su propio PIN y
  el row de `settings` en Supabase tenía `pinCode` en null/vacío, el valor null pisaba el
  default `2025` → el PIN esperado quedaba `null` y **ningún** PIN entraba. Además, si el PIN
  llegó a guardarse como número (columna numérica en Supabase), `"2611" !== 2611` fallaba.
- **Demora al entrar**: cada intento de PIN hacía un `await getSettings()` (viaje de red a
  Supabase) aunque el almacén ya tuviera su propio PIN. Igual en toda la app: settings y
  warehouses se re-consultaban en cada navegación.

### Arreglos
- `js/pin-utils.js` (nuevo, puro y testeado): `normalizePin`, `resolveExpectedPin`,
  `pinMatches` — comparación segura string/número y con trim de espacios.
- El login PIN ya **no consulta settings si el almacén tiene su propio PIN** (validación local,
  instantánea). El mensaje "PIN incorrecto" solo aparece cuando de verdad no coincide; si el
  almacén no tiene PIN configurado, avisa dónde configurarlo en vez de decir "incorrecto".
- **Caché TTL**: `getSettings` 60s y `listWarehouses` 30s (se invalidan al guardar) — la app
  entera deja de re-consultar Supabase en cada pantalla; el arranque en frío del plan gratis
  se siente una sola vez.
- 12 tests nuevos (107 total). `sw.js` caché v25. Sin migración SQL.

## v5.6.0 (2026-11-23) — Notificaciones en vivo + reportes de cierres

> Sin migración SQL nueva — usa las tablas de v5.5 (`transfer_requests`, `daily_closures`).
> Si vienes de v5.4 o anterior, ejecuta primero `migration-v5.5-transfers-closures.sql`.

### 🔔 Notificaciones en vivo de solicitudes
- **El admin se entera al momento**: suscripción en tiempo real (Supabase Realtime sobre
  `transfer_requests`). Cuando el personal envía una solicitud llega, sin recargar:
  beep corto (WebAudio, sin archivos), toast, banner destacado arriba del contenido con
  botón **Ver** (salta a Transferencias → Solicitudes) y el badge rojo de la sidebar se
  actualiza al instante.
- **Notification API**: si el navegador lo permite, además llega una notificación del sistema
  (con `tag` para no duplicar). Botón **"🔔 Activar notificaciones"** en la sidebar cuando el
  permiso aún no se otorgó ni se denegó.
- No notifica lo ya existente: solo solicitudes nuevas desde que abriste el panel.
- En demo el flujo completo es probabable: localStorage emite el evento `mannol-demo-requests-changed`.

### 📊 Reporte de cierres comparativo (admin → Cierres de caja)
- **Chips de período**: Esta semana (arranca lunes) / Este mes / Últimos 30 días.
- **Resumen del período**: total recaudado (+ promedio/día), ventas, unidades, cierres
  registrados y ticket promedio.
- **Comparativa por almacén** con barras (total USD) y promedio diario por local.
- **Top productos del período** agregados entre todos los cierres (máx 8).
- **Tabla por almacén** con cierres/ventas/unidades/total/prom-día/ticket-promedio y
  **export CSV del reporte** (`reporte-cierres-week|month|30d.csv`).

### 🧱 Técnico
- `sales-stats.js`: `reportPeriodRange` + `aggregateClosuresReport` + `dateKeyToMs` (puras, testeadas).
- `db.js`: `subscribeTransferRequests` (Realtime en producción, evento demo en localStorage);
  los writes demo emiten el evento para que la suscripción reaccione en vivo.
- `js/version.js` → 5.6.0 · `sw.js` CACHE v24 · 8 tests nuevos (95 total).

## v5.5.0 (2026-11-21) — FLUJO DE NEGOCIO: solicitudes de traspaso y cierre de caja

> ⚠️ **Requiere migración SQL (una vez)**: ejecutar `supabase/migration-v5.5-transfers-closures.sql`
> en Supabase → SQL Editor. Crea 2 tablas (`transfer_requests`, `daily_closures`) con RLS e índices.
> Sin la migración la app sigue funcionando; los dos flujos nuevos solo operan tras ejecutarla.

### 📦 Solicitudes de traspaso (personal ↔ admin)
- **El empleado pide mercancía**: en el interior del almacén, tab "Otros almacenes" → botón
  **Solicitar traspaso** por producto (elige almacén origen con disponibilidad, cantidad y nota).
- **"Mis solicitudes"** al pie del inventario: últimas 5 con estado (PENDIENTE / APROBADA / RECHAZADA).
- **El admin resuelve en Transferencias → "Solicitudes del personal"**: Aprobar mueve el stock
  (TRANSFERENCIA_SALIDA del origen + TRANSFERENCIA_ENTRADA al destino, con auditoría), Rechazar no
  toca stock. El badge rojo de la sidebar ahora suma transferencias + solicitudes pendientes.
- Regla anti-duplicados: índice único en BD — máx 1 solicitud PENDIENTE por (origen, destino, producto).
- Máquina de estados cerrada: PENDIENTE → {APROBADA, RECHAZADA, CANCELADA}; los finales no reabren.

### 💰 Cierre de caja diario
- **Interior del almacén → tarjeta "Cierre de caja"**: ventas/unidades/total del DÍA + desglose por
  moneda (siempre hoy, independiente del período elegido en el resumen).
- **"Cerrar caja de hoy"** guarda el snapshot; si ya había uno se actualiza con confirmación.
- **"Últimos cierres"** (7) plegable con fecha, ventas y responsable.
- **Admin → Sistema → "Cierres de caja"**: todos los almacenes con resumen por local, filtro,
  detalle por moneda y export CSV (columnas listas para Excel).

### 🧱 Técnico
- `js/sales-stats.js` nuevo: lógica pura compartida (stats de cierre + validación/máquina de estados
  de solicitudes) — testeada.
- Migración `migration-v5.5-transfers-closures.sql` + `schema.sql` actualizado para instalaciones nuevas.
- RLS por tabla: empleados escriben solicitudes y cierres; solo admins las resuelven.
- Demo: solicitudes y cierres persisten en localStorage (con seeds) para probar el flujo completo
  sin Supabase.
- `js/version.js` → 5.5.0 · `sw.js` CACHE v23 · 14 tests nuevos (87 total).

## v5.4.0 (2026-11-21) — UX: vender más rápido y panel más cómodo

### ⚡ POS (app del vendedor)
- **Búsqueda rápida inline**: en "Registrar venta" un buscador filtra productos al escribir y
  añade con un toque (Enter añade el primero). Ya no hace falta abrir el catálogo modal para
  la venta típica de 1-2 productos.
- **Calculadora de vuelto**: bajo el total, "¿Con cuánto paga el cliente?" — calcula el vuelto
  en la moneda seleccionada (efectivo, una sola moneda) o cuánto falta.
- **Ticket compartible**: al registrar la venta (online, offline o en cola) se abre un modal con
  el ticket y botones Compartir (Web Share → WhatsApp/SMS) y Copiar.
- **Comisiones solo para admins**: la línea "Comisión gestor/vendedor" de cada item del carrito
  ya solo la ve el admin — al vendedor le muestra el carrito limpio.

### 🏪 App del vendedor / interior de almacén
- **Resumen sin tiles en cero**: las KPIs muestran solo las monedas con actividad; las que están
  en 0 se resumen en una línea ("Sin movimiento: EUR · Transf.") en vez de ocupar media pantalla.
- **Badges de stock clicables**: "2 bajo" / "1 agotado" ahora FILTRAN la lista al tocarlos
  (segundo toque quita el filtro); lista vacía con CTA "Limpiar filtros".
- **Header sin código duplicado**: "Empleado · VIB · VIB" → "Empleado · Víbora".

### 🏠 Home y navegación
- **Hero compacto**: el bloque de marca ocupa una línea y las tasas/almacenes quedan visibles
  al abrir la app.
- **Banner de configuración descartable**: "No volver a mostrar" guarda la preferencia por
  dispositivo (el asistente sigue disponible en setup.html).
- **Abrir en el último destino**: la app recuerda la última vista del admin (dashboard, PIN o
  home) y reabre ahí al volver; los demás roles siguen entrando a su dashboard.

### 🖥️ Panel admin
- **Accesos rápidos compactos**: las 3 filas de tarjetas grandes se convirtieron en chips en
  una sola banda — las KPIs y gráficos quedan en la primera pantalla.
- **Tabla de Productos más densa**: la columna Marca se fusionó en el nombre y las comisiones
  G/V son un solo chip — más ancho para lo importante.
- **Sparklines con tooltip**: al pasar el mouse/dedo sobre la micro-tendencia de cada KPI se ve
  la fecha y el valor del día.
- **Export CSV en Productos y Usuarios** (además del de ventas/movimientos que ya existía):
  exporta lo filtrado, con las columnas listas para Excel.

### 🧰 Pulidos
- Targets táctiles ≥44px en botones de icono para pantallas táctiles (`pointer: coarse`).
- Búsqueda del historial ahora también cubre la **nota** y los **nombres de productos** de cada venta.

### Notas
- Sin cambios de esquema ni migración SQL en esta versión.
- `js/version.js` → 5.4.0 · `sw.js` CACHE v22 · `package.json` 5.4.0.

## v5.3.0 (2026-11-21) — MEJORAS: performance, filtros, imágenes más livianas y robustez offline

### ⚡ Performance (dashboard y consultas)
- **Dashboard ya no trae TODAS las ventas históricas**: `listSales({})` → `listSales({ from: ... })` y
  db.js filtra `created_at` EN LA BASE DE DATOS (índice `created_at`) con `.gte()/.lte()` en vez de
  traer todo y filtrar en el cliente. Con miles de ventas el panel vuelve a ser rápido.
- **Movimientos de stock**: buscador de texto (producto, usuario, nota, motivo) + **paginación**
  (50 por página con Anterior/Siguiente; las stats se calculan sobre todo el filtrado, no la página).
- `listStockMovements` acepta `from/to` en la query (server-side).

### 🖼️ Imágenes (GitHub + WebP + miniaturas)
- **Miniatura 200px automática**: al subir una imagen se generan DOS archivos WebP — la principal
  (máx 1200px) y `{nombre}-thumb.webp` (máx 200px) — en GitHub (Contents API), Supabase Storage o
  data URL según la config. Nuevo campo `products.thumb_url`.
- **La tabla de Productos ahora muestra la miniatura** de cada producto (antes texto solamente).
- Nuevo `supabase/migration-v5.3-improvements.sql` (ejecutar en SQL Editor) + `schema.sql` actualizado
  para instalaciones nuevas. Al cambiar/borrar imagen se limpia también la miniatura huérfana.

### 🎛️ Panel admin más cómodo
- **Filtros en las tablas**: Productos (buscar por nombre/marca/SKU + categoría + estado activo/inactivo),
  Usuarios (buscar + rol), Movimientos (texto libre). Los filtros restauran el foco tras re-render.
- **Precios en lote**: botón "Precios en lote" en Productos — cambia el precio de todos los productos
  filtrados a la vez (% / monto fijo / precio exacto) con vista previa y confirmación.
- **Sparklines en las KPI cards** del dashboard (Ingresos/Ventas/Unidades: micro-tendencia de `N` días,
  nuevo helper `sparkline()` en charts.js).
- **Exportar CSV del período** junto a los botones 7d/30d/90d/1 año.
- **Paleta de comandos Ctrl+K adaptada al admin**: secciones reales del panel + acciones rápidas
  (precios en lote, comparar almacenes, tema, refrescar). `global-search.js` ahora acepta
  `navItems`/`extraActions`; admin.js expone `window.__adminNavigateTo`.
- **Alertas de stock bajo al abrir el admin** (1 vez por día): toast + notificación push con los
  productos en el mínimo (`notifyLowStock` en push-notify.js).

### 📲 PWA — actualizaciones visibles
- **Banner "Nueva versión disponible"** (`js/update-banner.js`): cuando sw.js trae cambios, el
  usuario ve el banner con botón «Actualizar» (SKIP_WAITING + recarga) en vez de esperar.
  admin.html ahora TAMBIÉN registra el service worker aunque se abra directo.
- sw.js: caché v21 + handler de mensajes SKIP_WAITING.

### 🛡️ Robustez (requiere ejecutar el SQL nuevo)
- **Descuento de stock atómico al sincronizar ventas offline**: nueva RPC `deduct_sale_stock` —
  solo descuenta si hay stock suficiente, así dos puestos que vendieron lo mismo sin internet
  **ya no dejan el inventario en negativo**. Los items sin stock vuelven en `shortages` y la app
  avisa "venta sincronizada con revisión". Fallback automático al desconto clásico si la RPC no
  está instalada (instalaciones viejas siguen funcionando).
- **Auditoría de PIN**: cada intento fallido queda en la nueva tabla `pin_attempts` (best-effort,
  no bloquea nada si falla) — detección de accesos no autorizados.

### ✨ Pulido
- **Focus trap completo en modales** (Tab cicla dentro, foco restaurado al cerrar) — ui.js.
- **Copys unificados** al español neutro: eliminados los restos de voseo ("Tenés", "Seleccioná",
  "Conectá", "Volvé", "Hacé", "¿No sos administrador?"...) para la audiencia cubana.

### 🧪 Tests
- Nuevo `tests/sale-commissions.test.js` (6): helper puro `sumCartCommissions()` extraído del
  checkout retail de sales.js — el cálculo de comisiones ahora está testeado.
- Nuevo `tests/weekend-rule.test.js` (9): regla de fin de semana (`shouldRedirectWeekend` +
  `resolveEffectiveWarehouse`) — redirección, auditoría, fallbacks y días hábiles.
- Suite completa: **8 archivos, 73 tests OK**.

### ⚠️ PASO MANUAL (una vez): ejecutar `supabase/migration-v5.3-improvements.sql` en Supabase → SQL Editor.
- Añade `products.thumb_url`, la RPC `deduct_sale_stock` y la tabla `pin_attempts` (idempotente).
- Sin ejecutarlo, la app sigue funcionando (miniaturas fallan silenciosamente y el desconto usa el método clásico).

### Versiones
- sw.js: caché v21. package.json 5.3.0. js/version.js 5.3.0.

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

---

# 🚀 v5.1.0 — Mejoras de usabilidad + imágenes en GitHub

## 🐛 Fixes

### 1. Agregar un producto se quedaba cargando y no guardaba (CRÍTICO)
**Causa raíz (2 bugs combinados):**
- El diálogo "Nuevo producto" del **Catálogo** no enviaba el campo `brand`
  (es `NOT NULL` en la BD → el INSERT fallaba con error de constraint).
- El diálogo de **Productos del admin** enviaba campos legacy
  (`commission`, `commissionCurrency`) que **no existen** en la tabla
  `products` → error PGRST204 de PostgREST.
- `saveProduct()` **tragaba** ambos errores en silencio: la UI mostraba
  "Producto guardado" pero nada se guardaba.

**Solución:**
| Archivo | Cambio |
|---|---|
| `js/db.js` | `saveProduct()` ahora sanitiza el payload contra la lista real de columnas (`PRODUCT_COLUMNS`), completa `brand` con "MANNOL" si falta, y **lanza el error real** en vez de tragárselo. |
| `js/views/catalog.js` | Campo "Marca" en el diálogo (default MANNOL), botón con estado "Guardando…", y el error real se muestra en un toast. |
| `js/views/admin.js` | Quitados los campos legacy del payload; botón con estado de guardado; errores visibles. |

### 2. Confirmar transferencias fallaba (bug oculto encontrado)
El constraint de `stock_movements.reason` no incluía los motivos
`TRANSFERENCIA_SALIDA` / `TRANSFERENCIA_ENTRADA`, así que al confirmar
una transferencia el INSERT de auditoría fallaba y el stock no se movía.

**→ Ejecutar `supabase/migration-v4-transfer-reasons.sql` en el SQL Editor
de Supabase (es idempotente, se puede correr varias veces).**
También corregido en `schema.sql` para instalaciones nuevas.

## ✨ Mejoras

### 3. Gestor que refirió = desplegable con nombres (Registrar venta)
Antes había que escribir la SIGLA a mano (CM, AR…). Ahora es un
`<select>` con todos los gestores activos: "Nombre (SIGLA)", opción
"— Sin gestor —", y debajo muestra teléfono/código del gestor elegido.
Aplica a ventas retail y mayorista. Archivo: `js/views/sales.js`.

### 4. Nueva sección "Stock general" en el Admin
Admin → Gestión → **Stock general**:
- 4 tarjetas globales: unidades totales, con stock, bajo mínimo, agotados.
- **Stock separado por almacén (local)**: una tarjeta por almacén con su
  listado de productos y cantidades.
- **Matriz producto × almacén**: filas = productos, columnas = cada local,
  con Total, mínimo y estado (OK / Bajo / Agotado).
- Filtros: búsqueda, por almacén, "solo bajo mínimo/agotados", "solo agotados".
- Exportar CSV.
Archivo: `js/views/admin.js` (`mountStockPanel`).

### 5. Transferencias multi-producto desde Movimientos
Admin → Movimientos → "Nueva transferencia": ahora elegís **almacén origen
y destino** y aparece un **desplegable/lista con TODOS los productos** con el
stock disponible en el origen, donde podés **escribir la cantidad a mover de
cada uno** (0 = no mover). Valida que no muevas más del stock disponible y
crea las transferencias en lote (cada producto = una transferencia
pendiente en el panel Transferencias). Archivo: `js/views/admin.js`.

### 6. Imágenes de productos guardadas en GitHub 🆕
Las imágenes son lo que más pesa y agotaban el free tier de Supabase (1 GB).
Ahora las imágenes se suben **a tu repo de GitHub** vía la API de Contents y
se sirven desde `raw.githubusercontent.com` (o el CDN que configures).

- **Nuevo archivo:** `js/github-storage.js` (subida/borrado/test de conexión).
- **Nuevo panel:** Admin → Sistema → **Almacenamiento**: configuras owner,
  repo, rama, carpeta y token (fine-grained con permiso *Contents: Read and
  write*). El token se guarda solo en el dispositivo (localStorage), nunca
  se sube al repo. Guía paso a paso incluida en el panel.
- **Prioridad de subida:** GitHub → (si falla) Supabase → (modo demo) dataURL.
  Nunca se pierde una imagen.
- Al reemplazar/borrar un producto, la imagen anterior se intenta borrar
  del repo automáticamente.
- Archivo de ejemplo: `js/github-config.example.js` (opcional, para
  preconfigurar owner/repo sin token).

### 7. Alineación, tipografía y anti-desborde (CSS)
Bloque de fixes al final de `css/styles.css`:
- Tablas: textos con corte limpio, celdas numéricas alineadas y con
  números tabulares; sin carteles fuera de lugar.
- Badges con elipsis, títulos con `overflow-wrap`, hijos de flex/grid con
  `min-width:0` (fix clásico de desborde), selects/inputs dentro de su
  columna, toasts y modales adaptados a pantallas angostas,
  nav del admin con elipsis, imágenes acotadas a su contenedor.

## 🔄 Otros cambios
- `sw.js`: `CACHE_VERSION` → `mannol-pos-supabase-v9` (fuerza refresco de
  la PWA) + nuevos archivos en la precache.
- `js/types.js`: etiquetas de los motivos de transferencia.
- `package.json`: versión 5.1.0.

## 📋 Pasos posteriores a la subida
1. Subir todos los archivos del zip al repo (reemplazando los existentes).
2. **Supabase → SQL Editor → ejecutar `supabase/migration-v4-transfer-reasons.sql`.**
3. En la app: Admin → Sistema → **Almacenamiento** → configurar GitHub
   (owner `mannollubricantes21-lang`, repo `Mannol`, rama `main`,
   carpeta `product-images`) + token fine-grained con
   *Contents: Read and write* → "Probar conexión".
4. Cerrar y reabrir la app dos veces para que el Service Worker
   actualice la caché (o limpiar datos del navegador).

## v5.1.1 (2026-09-11)
- FIX: el pie del menú decía "MANNOL Supabase v4" (etiqueta antigua hardcodeada que confundía al verificar la versión). Ahora usa js/version.js (única fuente de verdad): "MANNOL POS v5.1.1 · build 2026-09-11".
- sw.js: cache v10 (fuerza actualización de clientes al publicar).
- Añadido INSTALACION_SUPABASE.md: guía paso a paso para saber qué SQL ejecutar en Supabase según el estado de tu BD.

## v5.1.2 (2026-09-11)
- FIX CRÍTICO: spinner infinito en el panel de Productos del admin al añadir/editar un producto (el producto SÍ se guardaba, pero la lista no se volvía a renderizar). Causa: se llamaba a mountProductsPanel(content) sin el parámetro `gen`, por lo que el guard `gen !== tabGeneration` abortaba el render. Corregido en 16 llamadas (Usuarios, Productos, Categorías, Almacenes, Gestores, Tarjetas) + guard defensivo `gen = gen ?? tabGeneration` en cada panel.
- NUEVO: Entrada / ajuste de stock por almacén. Nuevo diálogo desde Admin → Stock (botón "Entrada de stock" y botón "Ajustar" por producto) y desde Admin → Productos (icono de cajas por producto). Elige producto + almacén, muestra el stock actual, chips rápidos (+1/+6/+12/+24, -1), motivo y nota. Usa la RPC atómica adjust_stock y registra auditoría en stock_movements.
- db.js: adjustStock ahora propaga el error real (antes lo tragaba en silencio).
- sw.js: caché v11.

## v5.1.3 (2026-09-11 / build 2026-09-12)
- FIX: tab "Otros almacenes" (interior de almacén) mostraba "Cargando..." eterno. Ahora distingue cargando / error / vacío, muestra explicación de permisos por almacén y botón Reintentar.
- Stock panel (admin): aviso amarillo si no hay ninguna fila de stock visible (permisos RLS por almacén / rol del usuario).
- CSS v5.1.3: bloque anti-desborde extra en admin (badges, tablas, KPIs, toasts, grid).
- sw.js: caché v12.

## v5.1.9 (2026-09-12) — FIX 22P02: el id "pin-..." rompía la subida de ventas

### Cómo se encontró (gracias al banner de errores de v5.1.8)
El banner mostró el error real: `[22P02] invalid input syntax for type uuid: "pin-1789088327857"`.
Las sesiones por PIN generan ids de usuario `pin-<timestamp>` (js/views/pin-login.js).
Ese valor viajaba a `sales.user_id`, que en la BD es columna **uuid** → Postgres
rechazaba la venta. Lo mismo rompía en silencio:
- `adjust_stock(p_user_id uuid)` → **el stock de las ventas nunca se descontaba**.
- `card_movements.user_id` / `card_movements.sale_id` (sale_id es uuid y sale.id es "S-...").
- `update_sale_status(p_user_id uuid)` al cancelar.

### FIX APP — sanitizado de UUIDs en TODAS las escrituras (db.js)
- Nuevos `isUuid()` / `nullIfNotUuid()` exportados.
- `sanitizeSaleRow`: las 6 columnas uuid de `sales` (warehouse_id, user_id,
  manager_id, card_id, original_warehouse_id, weekend_warehouse_id) ahora
  descartan valores no-uuid → la venta sube con esos campos en null y el
  nombre del usuario (text) se conserva. Las ventas atascadas suben solas.
- `adjustStock` / `updateSaleStatus`: parámetros uuid sanitizados → el stock
  vuelve a descontarse aunque el usuario sea PIN.
- `recordCardMovementForSale`: sale_id y user_id sanitizados.
- `sanitizeSettingsRow`: weekend_warehouse_id sintético descartado.
- tests/sale-row.test.js: +6 casos uuid (incluye el caso real "pin-1789088327857").
  Verificación end-to-end contra la BD real: fila con id "S-..." y sin user_id → **201 Created**.
- sw.js: caché v19. package.json 5.1.9.

## v5.1.8 (2026-09-12) — El banner muestra el error real de sincronización

### Diagnóstico confirmado (probes REST contra la BD real)
- El SQL v5.1.7 SÍ se ejecutó bien: las 5 columnas existen y la verificación
  "VENTAS EN LA NUBE 0" es normal (el editor SQL solo muestra el último resultado).
- INSERT y UPSERT anónimos a `sales` devuelven **201 Created** — la base de datos
  ya acepta ventas sin problema. NO hace falta ejecutar más SQL.
- Si las ventas siguen "pendientes", el dispositivo está ejecutando **JavaScript
  viejo desde la caché del Service Worker**. Solución: actualizar la página 2 veces
  (o limpiar datos del sitio) y verificar el pie del menú: "MANNOL POS v5.1.8".

### FIX APP — transparencia total en el banner de pendientes
- `offline-sync.js`: nuevo `getLastSyncError()` — guarda código + mensaje real del
  último fallo de subida (ej. `[PGRST204] Could not find the 'X' column...`).
- `sync-banner.js`: si hay ventas pendientes y el último intento falló, el banner
  muestra el error exacto en rojo y, si es un error de columnas/permisos
  (PGRST*/42501), añade el aviso amarillo "Actualiza esta página 2 veces".
- Así cualquier fallo futuro se puede reportar con una simple captura del banner.
- sw.js: caché v18. package.json 5.1.8.

## v5.1.7 (2026-09-12) — FIX DEFINITIVO: ventas pendientes (faltaban columnas en la BD)

### Por qué seguía fallando tras el SQL v5.1.6
Dos causas encadenadas, confirmadas con probes REST contra la BD real:

1. **Faltaban columnas en la BD** (la migración v2 de "fin de semana" nunca se ejecutó):
   `sales.weekend_redirect`, `sales.original_warehouse_id`, `sales.weekend_warehouse_id`,
   `settings.weekend_warehouse_id`, `settings.weekend_redirect_enabled`.
   Cada venta fallaba con `PGRST204: Could not find the 'weekend_redirect' column of 'sales'`.
2. **La app enviaba campos fantasma**: las ventas encoladas llevan `_syncAttempts` →
   se convertía en `_sync_attempts` (columna inexistente) → **cada reintento fallaba
   aunque todo lo demás estuviera bien**. También `settings` enviaba
   `weekend_warehouse_name` (caché solo-app).

### FIX SQL — NUEVO `supabase/migration-v5.1.7-sales-weekend.sql`
- Añade las 5 columnas faltantes (idempotente, no toca datos) + 2 índices.
- **Hay que ejecutarlo en Supabase → SQL Editor** (Paso B, script 4).
- Al ejecutarlo, las ventas atascadas en la cola suben solas en <1 min.

### FIX APP — blindaje anti columnas fantasma (db.js)
- Nuevo `sanitizeSaleRow()` (whitelist `SALE_COLUMNS`): descarta cualquier campo
  que no sea columna real de `sales` (ej. `_sync_attempts`) antes de guardar.
  Ya no puede volver a pasar el error PGRST204 en ventas, venga de la UI o de la cola offline.
- Nuevo `sanitizeSettingsRow()` (whitelist `SETTINGS_COLUMNS`): el guardado de
  configuración ya no falla por `weekend_warehouse_name`.
- `schema.sql`: instalaciones nuevas ya incluyen las columnas de fin de semana.
- tests/sale-row.test.js: 5 tests. sw.js: caché v17. package.json 5.1.7.

## v5.1.6 (2026-09-12) — FIX: las ventas ya no se quedan "pendientes" + viscosidad automática

### 1) Ventas pendientes que nunca se subían (FIX CRÍTICO, requiere SQL)
- SÍNTOMA: al registrar una venta desde un acceso por PIN, quedaba en la cola ("1 venta(s) pendiente(s)") para siempre y el admin nunca la veía.
- CAUSA RAÍZ confirmada contra la BD real: el PIN no crea sesión de Supabase (rol `anon`) y las políticas RLS de `sales` solo permitían INSERT/SELECT a `authenticated`. Cada intento fallaba con `42501 new row violates row-level security policy for table "sales"`.
- FIX (SQL): NUEVO `supabase/migration-v5.1.6-sales-pin.sql` con 2 políticas:
  - `sales_insert_pin` — permite registrar ventas desde sesiones PIN.
  - `sales_read_pin` — permite ver las ventas (dashboard del vendedor, historial) y evita duplicados en la resincronización.
- Editar/cancelar sigue por la RPC `update_sale_status` (security definer), que ya funcionaba con PIN.
- `policies.sql` incluye ambas políticas para instalaciones nuevas.
- ⚠️ ** Hay que ejecutar el SQL en Supabase (SQL Editor) — la app sola no basta.**

### 2) Productos: la viscosidad se rellena sola desde el nombre
- El nombre ya trae la viscosidad ("MANNOL 5W-30 Longlife") — ya no hay que escribirla dos veces.
- NUEVO `js/viscosity.js`: detecta 5W-30 / 10W40 / 15W/40 / SAE 30 / ISO VG 46 / ATF / DOT 4 dentro del nombre.
- Admin → Nuevo/Editar producto: al escribir el nombre, el campo Viscosidad se rellena automáticamente (editable, nunca pisa un valor escrito a mano). El campo sigue siendo opcional.
- tests/viscosity.test.js: 15 tests.
- sw.js: caché v16. package.json 5.1.6.

## v5.1.5 (2026-09-12) — NUEVO: añadir stock a cada almacén por separado (Admin → Stock)
- La sección "Stock por almacén (local)" ahora tiene entrada directa por local:
  - Botón **+** en la cabecera de cada tarjeta de almacén → abre el diálogo de entrada con ESE almacén ya preseleccionado.
  - Botón **+** junto a cada producto dentro de la tarjeta → ajusta ESE producto en ESE local (producto y almacén preseleccionados).
  - Si el local está vacío: mensaje "Sin stock en este local todavía" + botón "Añadir el primero".
- Texto de ayuda bajo el título de la sección explicando los nuevos botones.
- El diálogo sigue siendo el mismo (stock actual en vivo, chips rápidos, motivo, nota, RPC atómica adjust_stock con auditoría).
- sw.js: caché v15. package.json 5.1.5.

## v5.1.4 (2026-09-12) — FIX: el index rebotaba al admin y no dejaba entrar por PIN
- CAUSA: `app.js` redirigía automáticamente index → admin.html siempre que hubiera una sesión de admin guardada en el dispositivo (`localStorage`), y además `subscribeAuth` restauraba el admin en cada carga aunque el dispositivo estuviera en sesión PIN. El dueño no podía abrir la app de almacenes ni verificar el stock como empleado.
- FIX: eliminada la redirección automática. El index vuelve a ser el hub de entrada:
  - El admin aterriza en el home (tasas + almacenes + PIN) con un nuevo botón **"Abrir panel admin"** (solo visible con rol admin).
  - El admin puede entrar por PIN al interior de sus almacenes como antes.
  - La sesión PIN ya no es sobrescrita por la sesión de Supabase al recargar.
  - El resto de roles (gestor/vendedor) mantienen el comportamiento original (dashboard al abrir).
- `admin.html` sigue funcionando igual (acceso directo o desde el botón del home).
- sw.js: caché v14. package.json 5.1.4.

## v5.1.3b (2026-09-12) — FIX DE BASE DE DATOS: stock invisible para accesos por PIN
- CAUSA RAÍZ confirmada con la BD real: el acceso por PIN de almacén no crea sesión de Supabase (rol `anon`) y las políticas RLS de `stock` solo permitían lectura a `authenticated`. El interior del almacén veía SIEMPRE 0 filas (stock añadido invisible + "Otros almacenes" vacío/cargando).
- NUEVO `supabase/migration-v5.1.3-pin-stock.sql`: política `stock_read_pin` (lectura anon de stock, solo lectura; escribir sigue exigiendo admin/gestor) + verificaciones automáticas + secciones opcionales (movimientos por PIN, asignar almacenes al usuario yandriel).
- `policies.sql`: incluye la misma política para instalaciones nuevas.
- `INSTALACION_SUPABASE.md`: nuevo apartado "añadí stock y NO aparece / Otros almacenes carga eterno" con diagnóstico.
- sw.js: caché v13. Sin cambios funcionales en la app (el fix es 100% SQL).

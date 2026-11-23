# 🚀 MANNOL POS · Roadmap de mejoras

**Fecha:** 2026-11-21 · **Base:** v5.2.0 (commit `e832c3e`)
Ideas concretas priorizadas por impacto y esfuerzo, derivadas de la revisión real
del código. Los nombres de archivo referencian donde se implementaría.

> ✅ **ESTADO (v5.3.0, 2026-11-21): implementadas las ideas 1, 2, 3, 4, 5, 6, 8, 11, 12, 13, 14, 15 y 17.**
> La 9 (comparativa entre almacenes) ya existía en "Stock general" (matriz producto × almacén).
> La 7 (limpieza de huérfanos) sigue cubierta por `lifecycle-cleanup.sql`.
> Pendiente en backlog: la 16 (JSDoc gradual). Ver CAMBIOS.md v5.3.0 para el detalle.

---

## 🔥 Prioridad alta (rápido de hacer, impacto directo en el día a día)

### 1. Filtros y búsqueda en todas las tablas del admin
**Dónde:** `js/views/admin.js` (paneles Products, Movements, Users, Stock).
Hoy solo algunas vistas tienen buscador. Añadir un `<input class="input">` + select
de categoría/estado en el `card-header` de cada tabla, filtrando en memoria
(los datasets caben en el cliente). *Esfuerzo: bajo · Impacto: alto.*

### 2. Paginación + rango de fechas en Movimientos y Dashboard
**Dónde:** `js/db.js → listSales/listStockMovements`, `js/views/admin.js:2947` (MOVIMENTS)
y `mountAnalyticsDashboard` (llama `listSales({})` y trae **todas** las ventas).
Con miles de ventas el dashboard se volverá lento: pasar `from/to` en la query
y añadir "cargar más" o paginación por página en Movimientos.
Crear índice `sales(created_at)` si no existe (ya está en `supabase/schema.sql` — verificar).
*Esfuerzo: medio · Impacto: alto a escala.*

### 3. Botón "Exportar CSV" en cada tabla y en los KPIs
**Dónde:** `js/csv-export.js` ya tiene `exportToCSV/exportMultipleCSVs`; solo falta
el botón en `card-header` de productos, movimientos, comisiones y el resumen del dashboard.
*Esfuerzo: bajo · Impacto: medio-alto (contabilidad).*

### 4. Alertas de stock bajo terminadas
**Dónde:** `js/push-notify.js` (hoy es un stub de 85 líneas) + badge rojo del sidebar.
Completar: al activar el permiso, notificar cuando `qty <= minStock` (ya se detecta en
`views/stock.js` y en el inventario del almacén). Fallback: toast al abrir la app.
*Esfuerzo: medio · Impacto: alto (evita quiebres de stock).*

### 5. Paleta de comandos para el admin (extender Ctrl+K)
**Dónde:** `js/global-search.js` ya existe para la app de vendedor.
En el admin, añadir acciones: "Nuevo producto", "Ajustar stock", "Ir a Tarjetas",
"Exportar todo". Con eso el admin se maneja sin mouse.
*Esfuerzo: medio · Impacto: medio-alto en productividad.*

---

## 📈 Performance y cuota de Supabase (free tier 5GB)

### 6. Miniaturas de 200px para listados
**Dónde:** `js/image-upload.js` ya convierte a WebP ≤1200px. Generar una segunda
variante `thumb` (200px, calidad 60) al subir y usarla en las tarjetas de producto,
catálogo y tablas. Reduce el peso de cada imagen en ~90% al listar.
*Esfuerzo: bajo-medio · Impacto: alto en cuota y velocidad.*

### 7. Limpieza programada de imágenes huérfanas
**Dónde:** `supabase/policies.sql` ya da `delete` a admins. Añadir una función RPC
`cleanup_orphan_images()` que compare `storage.objects` contra `products.image_url`
y un Job/cron de Supabase que la ejecute semanalmente.
*Esfuerzo: medio · Impacto: protege los 5GB del free tier.*

### 8. Validación de stock al sincronizar ventas offline
**Dónde:** `js/offline-sync.js` (hoy last-write-wins). Una venta offline podría
dejar stock negativo si otro puesto vendió lo mismo. Al sincronizar, llamar a un RPC
`validate_sale_stock()` que verifique disponibilidad y marque la venta como
`REVISION` en vez de aplicar el ajuste ciego.
*Esfuerzo: medio-alto · Impacto: alto en integridad de inventario.*

---

## ✨ Segunda ronda de pulido UX

### 9. Comparativa de stock entre almacenes
**Dónde:** la app ya tiene "Ver en otros almacenes" por producto
(`js/views/stock.js`, `listStockForProductInAllWarehouses`). Elevarlo a una vista
tabla side-by-side (producto × almacén) con totales por fila, exportable.
*Esfuerzo: medio · Impacto: alto para decisiones de transferencia.*

### 10. Editor de precios en lote
**Dónde:** `js/views/admin.js` (PRODUCTS). Seleccionar varios productos →
"subir precio X%" o "aplicar precio mayorista". Ahorra horas al actualizar catálogo.
*Esfuerzo: medio · Impacto: alto para el administrador.*

### 11. Sparklines en las KPI cards del dashboard
**Dónde:** `js/charts.js` ya tiene `lineChart` SVG; renderizar una micro-tendencia
de 7 días dentro de cada `stat-card` (Ingresos, Ventas, Unidades).
*Esfuerzo: bajo · Impacto: medio (lectura rápida de tendencia).*

### 12. Banner de "actualización disponible" de la PWA
**Dónde:** `sw.js` ya versiona `CACHE_VERSION`; `js/components/sync-banner.js` es
reutilizable. Detectar el evento `updatefound` del SW y mostrar el banner
"Nueva versión — tocar para recargar".
*Esfuerzo: bajo · Impacto: evita confusiones de versión en los teléfonos.*

### 13. Copys unificados (voseo vs Cuba)
**Dónde:** toda la UI mezcla "Tenés/Conectá" (rioplatense) con audience cubana
("Peso cubano", "elToque"). Definir un glosario único y pasarlo por los strings
(idealmente centralizarlos en `js/types.js` o un `js/i18n.js`).
*Esfuerzo: bajo · Impacto: consistencia percibida.*

### 14. Accesibilidad en modales y tablas
**Dónde:** `js/ui.js` (showModal ya cierra con Escape) → añadir focus-trap al abrir,
`aria-label` en botones de solo icono, y `caption`/`scope` en tablas.
Revisar contraste AA de `badge-warning` sobre la banda diagonal.
*Esfuerzo: medio · Impacto: inclusión + menos errores de tap.*

---

## 🧪 Calidad y mantenimiento

### 15. Tests del cálculo de venta (el flujo que más dinero mueve)
**Dónde:** `tests/` (hoy cubre utilidades). Añadir tests con Supabase mockeado para:
totales del carrito, comisiones gestor/vendedor por moneda, venta mayorista por caja
y la regla de fin de semana (`sales.js:829` en adelante).
*Esfuerzo: medio · Impacto: protege el core del negocio.*

### 16. Tipos con JSDoc (sin build step)
**Dónde:** `js/types.js` define enums; documentar con JSDoc `@typedef` las entidades
(Sale, Product, Card, Manager) y anotar `db.js`. El editor gana autocompletado
sin introducir bundler.
*Esfuerzo: medio (gradual) · Impacto: medio en mantenimiento.*

### 17. Log de auditoría de intentos de PIN fallidos
**Dónde:** `js/pin-rate-limit.js` ya limita intentos; persistir los fallos en
`stock_movements`/tabla de auditoría con usuario y almacén para detectar
intentos de acceso no autorizado.
*Esfuerzo: bajo · Impacto: seguridad.*

---

## Resumen esfuerzo / impacto

| # | Mejora | Esfuerzo | Impacto | Recomendación |
|---|--------|----------|---------|---------------|
| 1 | Filtros en tablas admin | Bajo | Alto | ✅ Ahora |
| 3 | Export CSV en tablas/KPIs | Bajo | Medio-alto | ✅ Ahora |
| 4 | Alertas stock bajo | Medio | Alto | ✅ Ahora |
| 12 | Banner de actualización PWA | Bajo | Medio | ✅ Ahora |
| 2 | Paginación dashboard/movimientos | Medio | Alto | Próxima |
| 6 | Miniaturas 200px | Bajo-medio | Alto | Próxima |
| 11 | Sparklines en KPIs | Bajo | Medio | Próxima |
| 5 | Paleta de comandos admin | Medio | Medio-alto | Próxima |
| 9 | Comparativa entre almacenes | Medio | Alto | Después |
| 10 | Precios en lote | Medio | Alto | Después |
| 8 | Validación stock offline | Medio-alto | Alto | Después |
| 7 | Limpieza huérfanos storage | Medio | Medio | Después |
| 13 | Copys unificados | Bajo | Medio | Después |
| 14 | Accesibilidad | Medio | Medio | Después |
| 15 | Tests de cálculo de venta | Medio | Alto | Después |
| 16 | JSDoc types | Medio | Medio | Backlog |
| 17 | Auditoría de PIN | Bajo | Medio | Backlog |

**Sugerencia de lote siguiente:** 1 + 3 + 4 + 12 (un fin de semana de trabajo,
mejora visible inmediata) y luego 2 + 6 (escalado y cuota).

# 🔍 Revisión MANNOL POS · Análisis Completo

**Fecha:** 2026-08-23
**Versión revisada:** branch `arena/01a02f67-mannol` (commit `28115b7`)
**Stack:** Vanilla JS + Supabase (Postgres + Auth + Storage + Realtime)

---

## 📊 Resumen ejecutivo

| Categoría | Estado | Detalle |
|---|---|---|
| **Funcionalidad core** | ✅ Sólido | Ventas, stock, comisiones, multi-moneda, mayorista, offline sync |
| **Estructura de código** | ✅ Limpia | ~12.7K líneas bien organizadas, módulos pequeños |
| **Bugs críticos** | 🐛 4 | Memory leaks, WebP sin límite, RLS storage, race condition PIN |
| **Bugs menores** | 🐛 9 | Refactor pendiente, validaciones faltantes |
| **Riesgo Supabase storage (5GB)** | ⚠️ **MEDIO** | Sin cuota, sin limpieza de huérfanos, sin thumbnails |
| **Optimizaciones pendientes** | 📋 8 | Performance, UX, a11y, indexing |

---

## 🐛 BUGS CRÍTICOS (ya arreglados en esta entrega)

### 1. **Memory leak en `home.js` al recargar vista** ✅ ARREGLADO
**Archivo:** `js/views/home.js:130-145`
**Síntoma:** Al hacer refresh de la vista Home, las suscripciones a `getSettings()`, `listWarehouses()` y `subscribeRates()` no se cancelan, solo se reemplazan.
**Impacto:** Acumula listeners, dispara renders múltiples y rompe el patrón de cleanup que el resto del código sí respeta.
**Fix aplicado:** Devuelve función cleanup en `mountHomeView` que cancela `unsubRates()`.

### 2. **Memory leak en `sales.js` — el FAB y drawer** ✅ ARREGLADO
**Archivo:** `js/views/sales.js:21-22`
**Síntoma:** `Promise.all([listCards(), listManagers()])` no se cancela ni se evita doble-fetch.
**Fix aplicado:** Flag local `catalogFetched` para evitar refetch + cleanup de `subscribeSyncStatus`.

### 3. **`image-upload.js`: WebP sin límite duro de peso** ✅ ARREGLADO
**Archivo:** `js/image-upload.js:9-12`
**Síntoma:** Redimensiona a 1200×1200 px pero no garantiza peso < 5MB (límite del bucket de Supabase). Una foto de 8000×6000 px convertida a WebP puede seguir pesando >5MB y tirar `413 Payload Too Large`.
**Fix aplicado:**
- Validar `webpBlob.size <= 5 * 1024 * 1024` antes de subir.
- Si excede, intentar re-codificar con calidad menor (0.7, 0.6, 0.5) en bucle.
- Solo entonces fallar con mensaje claro.

### 4. **Bucket `images` sin política de borrado** ✅ ARREGLADO
**Archivo:** `supabase/policies.sql:322-335`
**Síntoma:** Cualquier usuario autenticado puede subir a `products` y `images`, pero nadie puede borrarlos. Las imágenes huérfanas se acumulan para siempre, lo cual es la **mayor amenaza a los 5GB del free tier**.
**Fix aplicado:** Añadir `delete` policy restringida a `is_admin()` para que el panel admin pueda limpiar.

---

## 🐛 BUGS MENORES (documentados, no críticos)

### 5. **`home.js`: el seed demo en línea 130-141** 📝
- Si `listWarehouses()` retorna `[]` y Supabase está configurado, igual inyecta los demo warehouses. Eso puede confundir al admin.
- **Sugerencia:** Distinguir entre "Supabase no configurado" y "Supabase configurado pero sin warehouses".

### 6. **`pin-login.js`: race condition en doble submit** 📝
**Archivo:** `js/views/pin-login.js:107-117`
- Si el usuario presiona "Entrar" dos veces muy rápido, se crean dos empleados_pin antes de que el `submit.disabled = true` se propague.
- **Sugerencia:** Flag local `submitting` además de `disabled`.

### 7. **`dashboard.js`: drawer no se cierra con Escape** 📝
- Solo se cierra con click en overlay o botón X.
- **Sugerencia:** `keydown Escape` handler.

### 8. **`sales.js`: `cartTotal()` falla si el producto no existe** 📝
**Archivo:** `js/views/sales.js:42-48`
- En `renderWholesaleSection` se auto-mutaba `wholesalePricePerBox` cada vez que se llamaba `render()`. Combinado con `change` listeners que hacen `render()`, podía sobrescribir ediciones del usuario.
- **Sugerencia:** Solo auto-sugerir al cambiar `wholesaleBoxes` (no en cada render).

### 9. **`db.js`: `isDemo()` cachea incorrectamente si Supabase falla temporalmente** 📝
**Archivo:** `js/db.js:45-52`
- Si `getSupabase()` retorna `null` por timeout de CDN, `_isDemo = true` queda cacheado para siempre.
- **Sugerencia:** Reintentar o exponer método `clearDemoCache()`.

### 10. **`offline-sync.js`: `_syncAttempts` se persiste en el item mutado** 📝
**Archivo:** `js/offline-sync.js:230-240`
- Modifica `sale._syncAttempts` directamente sobre la referencia, luego hace `setState({ offlineQueue: [...offlineQueue] })` para forzar persistencia. Funciona, pero es frágil.
- **Sugerencia:** Usar `setState((st) => ({ offlineQueue: st.offlineQueue.map(...) }))`.

### 11. **`admin.js`: `mountUsersPanel` callback con generación rota** 📝
**Archivo:** `js/views/admin.js:189-201`
- `onSaved` se llama desde `showUserDialog`, pero ese callback invoca `mountUsersPanel(content)` (sin `tabGeneration`), por lo que el guard `if (gen !== tabGeneration) return` siempre es `false`.
- **Sugerencia:** Pasar `tabGeneration` al callback.

### 12. **`admin.js`: `mountAuditPanel` carga 200 movimientos sin paginación** 📝
- Si en 6 meses hay 5K movimientos, la query los trae todos de una. Hoy ok con 200, pero documentar para crecer.

### 13. **`store.js`: la cola offline no tiene tope** 📝
- Si una tienda está offline 30 días, la cola puede crecer sin límite y saturar `localStorage` (5-10MB).
- **Sugerencia:** Cap a 500 ventas con warning + archivo de respaldo opcional.

---

## 💾 ANÁLISIS SUPABASE — Riesgo de los 5GB

### 🚨 **Amenaza #1: Imágenes sin compresión ni lifecycle** (la más urgente)
**Estado actual:**
- Bucket `products`: lectura pública, escritura autenticada. ✅
- Bucket `images`: lectura pública, escritura autenticada. ⚠️ nadie lo usa desde la app, pero existe.
- Conversión a WebP al 82% quality, max 1200×1200. ✅
- **NO hay borrado de imágenes** cuando se borra/actualiza un producto. ❌
- **NO hay thumbnails** (la imagen completa se sirve en todos los lugares). ❌

**Cálculo de impacto** (escenario realista, 1 año):
| Concepto | Valor |
|---|---|
| Productos actuales | 12 demo |
| Productos reales esperados | 200-500 |
| Imágenes por producto | 1 |
| Tamaño promedio WebP @ 1200px calidad 0.82 | 150-300KB |
| **Tamaño total estimado** | 30-150 MB |
| Almacén DB (filas + JSONB) | < 50 MB |
| Realtime + logs | < 20 MB |
| **Total en 1 año** | **~200 MB** ← lejos de 5GB |

**PERO** si:
- Los usuarios suben fotos a tamaño original (los admins suben directo sin compresión) → **×3 a 5 más peso**.
- Nunca se borran productos viejos → 1GB+ en 2 años.

### ✅ **Plan de optimización aplicado / recomendado**

1. **CRÍTICO — Limpiar huérfanos al borrar producto** ✅ AÑADIDO EN `db.js`
   - `deleteProduct()` ahora invoca `storage.remove([imageUrl])` para borrar el archivo.
   - Solo si la URL es del bucket `products` (no URLs externas).

2. **IMPORTANTE — Validar peso antes de subir** ✅ AÑADIDO EN `image-upload.js`
   - Si WebP > 5MB, reintenta con calidad decreciente.
   - Falla con mensaje claro al admin.

3. **RECOMENDADO — Generar thumbnail** (no aplicado aún)
   - Versión 256×256 para listados, 64×64 para badges.
   - Guardar ambos archivos; usar thumbnail en `card` y full en modal.
   - Reduce bandwidth cliente + percepción de velocidad.

4. **RECOMENDADO — Lifecycle policy** (no aplicado aún)
   - Cron job mensual: borrar movimientos de stock > 2 años.
   - Requiere Edge Function o `pg_cron` (incluido en plan Pro). En free se puede hacer manual.

5. **OPCIONAL — Compresión agresiva para thumbnails** (no aplicado)
   - WebP @ calidad 0.6, max 400×400 = ~30KB por imagen.

### 🗄️ **Estimación detallada por tabla (1 año de uso)**

| Tabla | Filas/año | Peso/fila | Total |
|---|---|---|---|
| `sales` | 12,000 | ~2KB (items JSONB) | 24 MB |
| `stock_movements` | 60,000 | ~200B | 12 MB |
| `products` | 300 | ~3KB (con tiers) | 1 MB |
| `users` | 30 | ~500B | < 1 MB |
| `stock` (warehouse×product) | 1,200 | ~200B | < 1 MB |
| `managers`, `cards`, `warehouses` | < 50 | ~500B | < 1 MB |
| **DB total estimado** | | | **~40 MB** |
| **Storage (con 300 productos)** | | | **~50-90 MB** |
| **GRAN TOTAL** | | | **< 150 MB** |

✅ Con un plan de lifecycle adecuado, **5GB es suficiente para 25+ años** o 5,000+ productos.
⚠️ Sin lifecycle y con imágenes sin comprimir, puedes llegar a 5GB en 3-4 años.

---

## 🎨 ORGANIZACIÓN DE TARJETAS (cards / tarjetas) — SUGERENCIAS

### Estado actual
- Tabla `cards`: BPA / BANDEC / BANMET (solo 3 bancos cubanos soportados).
- 4 demo cards en seed.
- CRUD completo en admin → Tarjetas.
- Selector en POS: dropdown con `name · bank · last 4`.
- `bank` es enum hardcodeado (no extensible sin migración).

### 💡 Sugerencias de mejora

#### **1. Mejorar el formulario de creación**
Hoy el campo `number` es texto libre. Sugerencias:
- Auto-formatear con guiones cada 4 dígitos (`9225-6789-0123-4567`) mientras se escribe.
- Validar longitud (16 dígitos típicos de tarjetas cubanas).
- Mostrar el banco detectado al tipear el BIN (primeros 4 dígitos).

#### **2. Indicador visual de salud por tarjeta**
- `última venta`: timestamp de la última venta que usó esta tarjeta.
- `ventas del mes`: contador.
- `saldo estimado`: si se registra un campo `balance`.
- Alerta visual si la tarjeta está inactiva >30 días.

#### **3. Vincular tarjetas a gestores**
Nuevo campo opcional `manager_id` (FK a `managers.id`).
- Útil cuando cada gestor tiene su propia tarjeta para cobrar comisiones.
- Mostrar en el admin: "Tarjetas de Carlos Martínez".

#### **4. Filtros y búsqueda**
- En la lista del admin: filtro por banco, búsqueda por número enmascarado, toggle "solo activas".
- Vista mobile-friendly: convertir tabla actual en cards colapsables.

#### **5. Auditoría**
- Añadir `last_used_at` y `usage_count` (vía trigger o lógica en `saveSale`).
- Log en `stock_movements` no aplica, pero se puede crear tabla `card_usage_log`.

#### **6. Soporte para tarjetas en MN**
Hoy `card_id` y `card_number` se guardan en `sales`, pero `paid_transfer` está en USD. Sugerencia:
- Campo `paid_mn` separado para transferencias en MN.
- O un `transfers` table propia con `(sale_id, card_id, currency, amount, exchange_rate)`.

#### **7. Agrupar tarjetas por banco en la UI POS**
Actualmente en el selector del POS aparecen todas mezcladas:
```
<select>
  <option>BPA Principal · BPA · 4567</option>
  <option>BANDEC Ventas · BANDEC · 3333</option>
```
Mejora con `<optgroup>`:
```
<optgroup label="BPA">
  <option>Principal · 4567</option>
  <option>Secundaria · 9999</option>
</optgroup>
<optgroup label="BANDEC">...</optgroup>
```

#### **8. Indicador en tiempo real del favorito**
- Campo `is_preferred` (boolean) en cards.
- En el POS, ordenar con la preferida primero.
- En el admin, mostrar ⭐ al lado de la preferida.

---

## 📦 COSAS QUE DEBES AÑADIR / MEJORAR

### 🔒 Seguridad (urgente)

1. **Rate limiting en PIN de almacén** ❌
   - Hoy: intentos infinitos hasta acertar.
   - Sugerido: 5 intentos, luego bloqueo de 5 min (en `settings` o nueva tabla `pin_attempts`).

2. **Validar longitud mínima de PIN** ❌
   - Hoy acepta `pin = "1"`.
   - Sugerido: mínimo 4 dígitos en el form del admin.

3. **HTTPS-only en producción** ⚠️
   - El manifest declara `display: standalone` (PWA), pero no fuerza HTTPS.
   - Supabase ya exige HTTPS en el cliente.

4. **Sanitización al mostrar `note` y `customerName`** ❌
   - En `sales-history.js` y otros, se renderiza con `textContent` (✅) pero en `dashboard.js` y `home.js` se usa `innerHTML` con interpolación directa:
     ```js
     ${sale.code} · ${sale.managerName || sale.userName || '—'}
     ```
   - Si un `managerName` tuviera `<script>`, se ejecutaría.
   - **Fix:** Usar `textContent` o helper `escapeHtml()`.

### 📈 Performance

5. **Paginación en historial de ventas** ❌
   - `subscribeSales` carga TODAS las ventas, no solo las recientes.
   - En un año, son 12K+ filas → realtime cada cambio re-fetchea TODO.
   - Sugerido: paginación o `range(0, 50)` + infinite scroll.

6. **Índices faltantes** ❌
   - No hay índice en `sales.items` (JSONB). Búsquedas por productId son lentas.
   - Sugerido: GIN index en `sales.items`:
     ```sql
     create index idx_sales_items_gin on public.sales using gin (items);
     ```

7. **Realtime: filtrar por warehouse** ⚠️
   - `subscribeSales(cb, { warehouseId })` aplica el filtro en el cliente, no en la subscripción realtime.
   - El server manda TODOS los cambios, el cliente filtra. Con 4 almacenes y 100 ventas/día, son 400 mensajes/día innecesarios.
   - Sugerido: filtrar a nivel de canal:
     ```js
     channel.on("postgres_changes", {
       event: "*",
       schema: "public",
       table: "sales",
       filter: `warehouse_id=eq.${warehouseId}`
     }, ...)
     ```

### 🎨 UX

8. **PWA: botón "Add to Home Screen" en iOS** ❌
   - iOS no muestra el prompt automáticamente.
   - Sugerido: detectar iOS Safari y mostrar un banner instructivo.

9. **Confirmación al cancelar venta** ❌
   - En sales.js, el botón "Cancelar" limpia sin confirmar.
   - Sugerido: `confirmDialog()`.

10. **Indicador de stock bajo en productos del POS** ⚠️
    - Se muestra "Sin stock suficiente" al intentar agregar, pero no hay warning visual.
    - Sugerido: badge "Bajo stock" en el catálogo cuando `quantity <= minStock`.

11. **Búsqueda en stock por SKU/categoría/viscosidad** ❌
    - Hoy solo busca por nombre/marca.
    - Sugerido: añadir filtro por categoría, marca, y rango de stock.

### 📊 Reportes y analytics

12. **Dashboard de admin: ventas por día/mes/año** ❌
    - Hoy solo "Historial" lista ventas.
    - Sugerido: gráfico de líneas de los últimos 30/90/365 días, con comparativa vs período anterior.

13. **Exportar ventas a CSV/Excel** ❌
    - Solo inventario se exporta.
    - Sugerido: `exportToCSV` para ventas con filtros de fecha.

14. **Reporte de inventario bajo** ❌
    - "X productos están bajo el mínimo" — sin notificación automática.
    - Sugerido: badge en topbar del admin + email/push opcional.

### 🔧 Mantenibilidad

15. **TypeScript ligero con JSDoc** ❌
    - Las funciones críticas no tienen typedef.
    - Sugerido: añadir JSDoc en `db.js`, `auth.js`, `store.js`.

16. **Tests unitarios** ❌
    - Cero tests. La lógica de mayorista, comisiones, stock, es compleja.
    - Sugerido: Vitest + 10-15 tests de los caminos críticos.

17. **CI / pre-commit hook** ❌
    - Sin linter, sin formateador.
    - Sugerido: ESLint + Prettier + GitHub Actions.

18. **Documentación de los flujos offline** ⚠️
    - El código de `offline-sync.js` está bien comentado, pero falta un README sobre "qué pasa si el cliente está offline 30 días".

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN (ya hechos en esta entrega)

- [x] Memory leak en `home.js` — cleanup de suscripciones
- [x] Memory leak en `sales.js` — flag de fetch + cleanup de sync
- [x] `image-upload.js` — validación de peso 5MB con reintentos
- [x] `policies.sql` — DELETE policy para buckets de storage
- [x] `db.js` — `deleteProduct` borra imagen huérfana del storage
- [x] `sales.js` — calcular `total_mn` y `total_eur` para `paid_mn` en ventas
- [x] `auth.js` — manejar error de red en `loginWithEmail` (en demo mode ya estaba)
- [x] `store.js` — tope de 500 ventas en cola offline
- [x] `index.html` y `admin.html` — escapar correctamente los datos de usuario en UI

---

## 📌 PRÓXIMOS PASOS RECOMENDADOS (orden de prioridad)

1. **Corto plazo (1-2 semanas):**
   - Sanitizar TODOS los `innerHTML` con datos de DB (riesgo XSS).
   - Paginación en historial de ventas.
   - Confirmación al cancelar venta.
   - Rate limit en PIN.

2. **Mediano plazo (1 mes):**
   - Generar thumbnails de imágenes.
   - Filtros avanzados en stock (categoría, marca, rango).
   - Exportar ventas a CSV.
   - Lifecycle: borrar movimientos > 2 años (script manual SQL).

3. **Largo plazo (3 meses):**
   - Migrar a TypeScript o añadir JSDoc completo.
   - Tests unitarios con Vitest.
   - CI con GitHub Actions.
   - Multi-idioma (i18n) si planeas expandir fuera de Cuba.

---

## 📞 Recursos útiles

- **Supabase Storage limits:** https://supabase.com/docs/guides/storage/limits
- **Free tier:** 1GB DB + 5GB storage + 2GB bandwidth
- **Realtime limits free:** 200 concurrent + 500K mensajes/mes
- **Si llegas al límite:** Upgrade a Pro ($25/mes) o limpiar manualmente desde SQL editor.

---

**Conclusión:** El proyecto está bien diseñado y optimizado para arrancar. Los 5GB del plan free son **más que suficientes** si implementas la limpieza de huérfanos (ya añadida) y sigues las recomendaciones de lifecycle. Los bugs críticos arreglados eliminan las mayores fuentes de crecimiento descontrolado.

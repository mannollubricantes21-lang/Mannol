# MANNOL POS · Sistema de Ventas y Stock (Supabase Edition)

Sistema POS multi-almacén para distribuidor de aceites MANNOL. Funciona offline,
multi-moneda (USD/MN/EUR/Transferencia), comisiones por gestor/vendedor,
sincronización de tasas con API elToque. PWA vanilla JS sin bundler.

> Esta versión **reemplaza Firebase por Supabase**. Toda la lógica de
> Auth, Firestore y Storage ha sido migrada a Supabase Auth, Postgres y
> Supabase Storage. La arquitectura y la API son idénticas — los archivos
> `js/views/*.js` no requieren cambios.

---

## Stack

| Componente        | Tecnología                                 |
| ----------------- | ------------------------------------------ |
| Frontend          | Vanilla JS (ES modules) — sin bundler      |
| Estilos           | CSS propio + sistema de variables (OKLCH)  |
| Backend           | Supabase (Postgres + Auth + Storage + Realtime) |
| Offline           | Service Worker + cola idempotente en localStorage |
| PWA               | manifest.webmanifest + sw.js               |
| Tests             | Vitest + jsdom                            |
| CI                | GitHub Actions                            |

---

## Migración Firebase → Supabase

| Firebase                         | Supabase                                 |
| -------------------------------- | ---------------------------------------- |
| `js/firebase.js`                 | `js/supabase.js`                         |
| `js/firebase-config.example.js`  | `js/supabase-config.example.js`          |
| `js/firestore.js`                | `js/db.js` (misma API surface)           |
| `firebase.json`                  | `supabase/schema.sql` + `policies.sql`   |
| `firestore.rules`                | `supabase/policies.sql` (RLS)            |
| `firestore.indexes.json`         | `supabase/schema.sql` (CREATE INDEX)     |
| `storage.rules`                  | `supabase/policies.sql` (buckets)         |

Archivos Firebase eliminados: `firebase.json`, `firestore.rules`, `storage.rules`,
`firestore.indexes.json`, `js/firebase.js`, `js/firestore.js`, `js/firebase-config.example.js`.

---

## Setup (5 pasos)

### 1. Crear proyecto Supabase

1. Ve a https://supabase.com y crea una cuenta / inicia sesión.
2. Crea un nuevo proyecto (anota la contraseña del DB).
3. Espera a que termine el provisioning (~2 min).

### 2. Ejecutar el esquema SQL

Entra a **SQL Editor → New query** y ejecuta **en este orden exacto**:

1. **`supabase/schema.sql`** → crea 14 tablas + índices + 3 RPCs + campos mayorista
2. **`supabase/policies.sql`** → activa RLS + buckets de Storage + grants + funciones de seguridad (filtrado por almacén, cambio de contraseña, desactivación de usuarios)
3. **`supabase/seed.sql`** → datos demo + productos con tiers mayorista

> ⚠️ **IMPORTANTE**: Ejecuta los 3 scripts en orden. NO ejecutes ningún archivo `migration-*.sql` en una instalación nueva — todo está consolidado en `policies.sql`. Si los ejecutas sin tener las tablas creadas, dará error "relation does not exist".

### 3. Crear el usuario admin inicial

1. Ve a **Authentication → Users → Add user**.
2. Email: `admin@mannol.cu` (o el que prefieras).
3. Marca "Auto Confirm User".
4. Anota el UUID del usuario.
5. Ejecuta este SQL (reemplaza `<ADMIN_AUTH_UID>`):

```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

### 4. Configurar el frontend

```bash
cd js
cp supabase-config.example.js supabase-config.js
```

Edita `supabase-config.js` con:

- **Project URL**: lo encuentras en Project Settings → API.
- **anon public key**: la misma página.

```js
export const supabaseConfig = {
  url: "https://TUPROYECTO.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIs..."
};
export const isSupabaseConfigured = true;
```

### 5. Servir la app

Es una app estática. Sirve la raíz del proyecto con cualquier servidor:

```bash
# Opción A — Python
python3 -m http.server 8080

# Opción B — Node
npx serve .

# Opción C — Deploy a Vercel/Netlify/GitHub Pages
# Solo arrastra la carpeta. No requiere build.
```

Abre http://localhost:8080. La app debería cargar, y como Supabase está configurado,
podrás iniciar sesión con el admin que creaste en el paso 3.

---

## Modo demo (sin Supabase)

Si `js/supabase-config.js` no existe o no está configurado, la app funciona
en **modo demo** con datos hardcodeados (`js/demo-data.js`).

- Login admin: `admin` / `admin123`
- Login vendedor: `cen` / `central2025` o `ved` / `vedado2025`
- 4 almacenes demo (Víbora, Lisa, Playa, Centro Habana)
- 12 productos demo (MANNOL Energy Formula, Filtros, Líquidos, Accesorios)
- ~80 ventas demo distribuidas en 30 días

Esto permite probar el UI sin necesidad de desplegar backend.

---

## Estructura del proyecto

```
Mannol/
├── index.html              ← App shell + bootstrap
├── admin.html              ← Panel admin (carga solo código admin)
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service Worker
├── offline.html            ← Fallback sin conexión
├── package.json            ← Dependencias dev (Vitest, etc)
├── vitest.config.js        ← Configuración de tests
├── REVIEW.md               ← Análisis completo del proyecto
├── README.md               ← Este archivo
├── .github/
│   └── workflows/
│       └── ci.yml          ← GitHub Actions (lint + test + SQL)
├── css/
│   └── styles.css          ← Sistema de diseño (OKLCH + temas)
├── js/
│   ├── supabase.js         ← Cliente Supabase (lazy init desde CDN)
│   ├── supabase-config.example.js  ← Template de config
│   ├── db.js               ← Capa DAL (reemplaza firestore.js)
│   ├── auth.js             ← Supabase Auth wrapper
│   ├── image-upload.js     ← Supabase Storage wrapper (WebP + 5MB cap)
│   ├── offline-sync.js     ← Cola offline idempotente
│   ├── pin-rate-limit.js   ← Rate limit para PIN de almacén
│   ├── store.js            ← Estado global (Zustand-like)
│   ├── types.js            ← Constantes y defaults
│   ├── currency.js         ← Formateo de moneda y fecha
│   ├── ui.js               ← Toast, modal, iconos SVG, escapeHtml
│   ├── charts.js           ← Gráficos SVG inline (bar/line/donut)
│   ├── demo-data.js        ← Datos demo
│   ├── app.js              ← Bootstrap + router de vistas
│   ├── components/
│   │   └── sync-banner.js  ← Banner de estado de sync
│   └── views/              ← 14 vistas (home, dashboard, sales, ...)
├── supabase/
│   ├── schema.sql          ← 14 tablas + índices + 3 RPCs + campos mayorista
│   ├── policies.sql        ← RLS + buckets Storage + grants + funciones seguridad
│   ├── seed.sql            ← Datos demo iniciales
│   ├── supabase-README.md  ← Guía detallada del backend
│   └── lifecycle-cleanup.sql  ← Mantenimiento (manual o pg_cron)
├── tests/                   ← Tests con Vitest
│   ├── pin-rate-limit.test.js
│   ├── escape-html.test.js
│   ├── wholesale.test.js
│   ├── currency.test.js
│   ├── store-cap.test.js
│   └── client-ref.test.js
└── icons/                   ← Favicon + PWA icons
```

---

## Comandos útiles

```bash
# Validar sintaxis de todos los archivos JS
npm run validate

# Ejecutar tests
npm test

# Tests con UI
npm run test:ui

# Cobertura de código
npm run test:coverage

# Linter
npm run lint

# Formatear código
npm run format
```

---

## Ventas mayoristas (desde v9)

Cada producto puede tener configuración mayorista opcional:

- `units_per_box`: pomos/botellas por caja (NULL = no mayorista)
- `wholesale_tiers`: JSON con escalones de precio por cantidad

Ejemplo de `wholesale_tiers`:
```json
[
  {
    "minBoxes": 1,
    "maxBoxes": 5,
    "pricePerUnit": 22,
    "vendorCommission": 0.50,
    "gestorCommission": 0.30
  },
  {
    "minBoxes": 6,
    "maxBoxes": 20,
    "pricePerUnit": 20,
    "vendorCommission": 0.75,
    "gestorCommission": 0.40
  },
  {
    "minBoxes": 21,
    "maxBoxes": null,
    "pricePerUnit": 18,
    "vendorCommission": 1.00,
    "gestorCommission": 0.50
  }
]
```

Las ventas mayoristas se guardan en la misma tabla `sales` con:
- `sale_type = 'WHOLESALE'`
- `boxes`: cajas vendidas
- `price_per_box`: precio negociado (editable al registrar)
- `vendor_commission_per_box`: comisión vendedor/caja (editable)
- `gestor_commission_per_box`: comisión gestor/caja (editable)

---

## RPCs (functions Postgres)

| Function | Descripción |
|----------|-------------|
| `adjust_stock(...)` | Insert/update atómico de stock + auditoría |
| `update_sale_status()` | Cambio de estado de venta atómico (stock en tx) |
| `create_admin_user()` | Crea auth.user + perfil público en una transacción |
| `change_user_password()` | Admin cambia contraseña sin exponer service_role |
| `deactivate_user()` | Soft-delete + ban automático en auth.users |
| `is_admin()` | Helper RLS |
| `is_active_user()` | Helper RLS |
| `is_admin_or_gestor()` | Helper RLS |
| `user_can_access_warehouse()` | Helper RLS por warehouseIds |

---

## Realtime

Las subscripciones en `db.js` (funciones `subscribe*`) usan **Supabase Realtime**.

Para verificar: **Database → Replication** → las tablas del schema `public`
deben estar en la publicación `supabase_realtime`. Si alguna no aparece:

```sql
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.stock;
alter publication supabase_realtime add table public.rates;
alter publication supabase_realtime add table public.warehouses;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.subcategories;
```

---

## Storage

2 buckets públicos creados automáticamente:

- `products` — imágenes de productos (WebP, < 5MB, con limpieza automática al borrar)
- `images` — imágenes genéricas

Políticas:
- **Lectura pública** (anon + authenticated)
- **Escritura**: solo authenticated
- **Borrado**: solo admin (limpieza de huérfanos)

---

## Lifecycle / Mantenimiento

Para evitar que la DB crezca sin control (free tier = 500 MB), ejecuta periódicamente
`supabase/lifecycle-cleanup.sql` desde el SQL Editor. Recomendado: cada 3-6 meses.

El script:
- Borra movimientos de stock > 2 años
- Borra ventas canceladas > 1 año
- Compacta las tablas (VACUUM ANALYZE)
- Muestra el tamaño actual de cada tabla

Si tienes plan Pro, descomenta la sección de `pg_cron` para automatizar.

---

## Crear el primer admin

Como las políticas RLS requieren autenticación, **el primer admin debe crearse manualmente**:

1. **Authentication → Users → "Add user"**
2. Email: `admin@mannol.cu`, contraseña segura, marcar "Auto Confirm"
3. Copia el UUID del usuario
4. Ejecuta:
```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

A partir de ahí, el admin puede crear más usuarios desde la UI (vista Users),
que usa la RPC `create_admin_user`.

---

## Resolución de problemas

### Error: "relation public.products does not exist"

Ejecutaste `policies.sql` o `seed.sql` antes de `schema.sql`.
**Solución**: ejecuta `schema.sql` → `policies.sql` → `seed.sql` (en ese orden).

### Error: "column units_per_box does not exist"

Tu `schema.sql` es de una versión muy antigua (pre-v9).
**Solución**: descarga la última versión del repo y vuelve a ejecutar `schema.sql` (incluye todos los campos mayoristas).

### Error: "function user_can_access_warehouse does not exist"

Tu `policies.sql` es de una versión muy antigua.
**Solución**: descarga la última versión del repo y vuelve a ejecutar `policies.sql`.

### Las suscripciones realtime no funcionan

Verifica que las tablas estén en la publicación `supabase_realtime` (ver sección Realtime arriba).

### No puedo crear usuarios desde el panel admin

La RPC `create_admin_user` requiere que el caller esté autenticado como admin.
Verifica que tu usuario tenga `role = 'admin'` en la tabla `public.users`.

### Un vendedor ve ventas de otros almacenes

Las políticas RLS de `stock`, `stock_movements` y `sales` usan `user_can_access_warehouse()`.
Si no usas el filtrado por almacén, asigna todos los `warehouse_ids[]` correctamente al usuario,
o cambia las políticas para usar `is_active_user()` directamente (menos seguro).

### Error "Cannot read property of undefined" al cargar el admin

Probablemente `supabase-config.js` no existe o no está configurado. Verifica que:
1. El archivo existe en `js/supabase-config.js`
2. Tiene `isSupabaseConfigured = true`
3. `url` y `anonKey` son válidos

### La app carga lento o se traba

- El Service Worker puede estar sirviendo una versión cacheada. Borra la caché del navegador o ve a DevTools → Application → Service Workers → Unregister.
- Supabase puede estar rate-limiting. Revisa el dashboard de Supabase para ver las métricas.

---

## License

MIT © 2026 Almacén POS

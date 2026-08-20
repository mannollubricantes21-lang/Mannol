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
| Estilos           | CSS propio + sistema de variables (OKLCH)   |
| Backend           | Supabase (Postgres + Auth + Storage + Realtime) |
| Offline           | Service Worker + cola idempotente en localStorage |
| PWA               | manifest.webmanifest + sw.js               |

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

Entra a **SQL Editor → New query** y pega el contenido de:

1. `supabase/schema.sql` → crea tablas, índices, triggers y RPCs (ajusta_stock, update_sale_status, create_admin_user).
2. `supabase/policies.sql` → activa RLS en todas las tablas + crea políticas + buckets de Storage.
3. `supabase/seed.sql` → inserta datos demo (settings, rate_config, rates, warehouses, managers, cards, categories, products).

Ejecuta cada archivo en orden.

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
├── manifest.webmanifest    ← PWA manifest
├── sw.js                   ← Service Worker
├── offline.html            ← Fallback sin conexión
├── css/
│   └── styles.css          ← Sistema de diseño (OKLCH + temas)
├── js/
│   ├── supabase.js         ← Cliente Supabase (lazy init desde CDN)
│   ├── supabase-config.example.js  ← Template de config
│   ├── db.js               ← Capa DAL (reemplaza firestore.js)
│   ├── auth.js             ← Supabase Auth wrapper
│   ├── image-upload.js     ← Supabase Storage wrapper
│   ├── offline-sync.js     ← Cola offline idempotente
│   ├── store.js            ← Estado global (Zustand-like)
│   ├── types.js            ← Constantes y defaults
│   ├── currency.js         ← Formateo de moneda y fecha
│   ├── ui.js               ← Toast, modal, iconos SVG
│   ├── demo-data.js        ← Datos demo
│   ├── app.js              ← Bootstrap + router de vistas
│   ├── components/
│   │   └── sync-banner.js  ← Banner de estado de sync
│   └── views/              ← 14 vistas (home, dashboard, sales, ...)
├── supabase/
│   ├── schema.sql          ← 14 tablas + índices + 3 RPCs
│   ├── policies.sql        ← RLS + buckets de Storage
│   ├── seed.sql            ← Datos demo iniciales
│   └── README.md           ← Guía detallada del backend
└── icons/                  ← Favicon + PWA icons
```

---

## Bug fixes incluidos en esta versión

1. **PIN de almacén no funcionaba** — `pin-login.js` leía `warehouse.pinCode`
   pero el campo real en la BD es `pin`. Ahora lee `warehouse.pin || settings.pinCode`.

2. **Inconsistencia `order` vs `sortOrder` en categorías** — `subscribeCategories`
   usaba `order` pero `listCategories` usaba `sortOrder` (que no existía como columna).
   Ambos usan ahora `sort_order` consistentemente. `saveCategory` acepta ambos
   campos para backwards compat.

3. **Race condition en `adjustStock`** — antes hacía read-then-write que podía
   perder actualizaciones concurrentes. Ahora usa una RPC Postgres
   (`adjust_stock`) que hace `INSERT ... ON CONFLICT DO UPDATE` atómicamente.

4. **`updateSaleStatus` no transaccional** — el descuento/restauración de stock
   se hacía en un loop en JS; si fallaba a mitad, la venta quedaba inconsistente.
   Ahora usa la RPC `update_sale_status` que ejecuta todo en una transacción.

5. **Idempotencia débil en offline-sync** — antes hacía una query + insert;
   ahora usa `client_ref UNIQUE constraint` + `INSERT ON CONFLICT DO NOTHING`
   para garantizar idempotencia incluso bajo concurrencia.

6. **`getWarehouseSummary` y `getWarehouseHistory` eran TODO** — estaban
   implementados solo en modo demo. Ahora funcionan también en Supabase.

7. **Imports de Firebase muertos** — `writeBatch` se importaba pero nunca se
   usaba. Eliminado.

---

## Mejoras de diseño y UX pendientes (ZIP #2)

- Layout responsive para desktop (la clase `.app-layout-desktop` existe
  pero no se usa en HTML).
- Skeleton loaders durante cargas.
- aria-labels en botones de icono.
- Eliminar duplicación de constantes (`types.js` vs `currency.js`).
- Mejorar manejo de modales anidados.

---

## License

MIT © 2026 Almacén POS

# Supabase Backend · MANNOL POS

Este directorio contiene todos los scripts SQL necesarios para configurar
el backend de MANNOL POS en Supabase.

---

## 🚀 Instalación nueva (recomendada)

Si estás empezando desde cero, ejecuta en orden en **Supabase Dashboard → SQL Editor**:

1. **`schema.sql`** — Crea las 14 tablas + índices + 3 RPCs atómicas + campos mayoristas
2. **`policies.sql`** — Activa RLS + buckets de Storage + grants + funciones de seguridad (filtrado por almacén, cambio de contraseña, desactivación de usuarios)
3. **`seed.sql`** — Inserta datos demo (almacenes, productos con tiers mayorista, etc.)

> ✅ **Todo está consolidado**. No hay archivos `migration-*.sql` separados.
> `schema.sql` ya incluye los campos mayoristas (`units_per_box`, `wholesale_tiers`, `sale_type`).
> `policies.sql` ya incluye el filtrado por almacén (`user_can_access_warehouse`) y las RPCs de seguridad (`change_user_password`, `deactivate_user`).

Después de ejecutar los 3 scripts, crea el primer usuario admin:

1. **Authentication → Users → "Add user"** → email + contraseña → marcar "Auto Confirm"
2. Copia el UUID del usuario
3. Ejecuta este SQL (reemplaza `<ADMIN_AUTH_UID>`):

```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

---

## 🧹 Mantenimiento

### `lifecycle-cleanup.sql`

Script de mantenimiento manual/ejecutable vía `pg_cron` (plan Pro):

- Borra movimientos de stock > 2 años
- Borra ventas canceladas > 1 año
- Compacta las tablas (VACUUM ANALYZE)
- Muestra el tamaño actual de cada tabla

**Cuándo ejecutarlo:** cada 3-6 meses (o configurar `pg_cron` para automatizar).

---

## Archivos

| Archivo | Descripción | Para qué sirve |
|---------|-------------|----------------|
| `schema.sql` | 14 tablas + índices + 3 RPCs + campos mayorista | **Instalación nueva** |
| `policies.sql` | RLS + buckets Storage + grants + funciones seguridad | **Instalación nueva** |
| `seed.sql` | Datos demo + productos con tiers mayorista | **Instalación nueva** |
| `lifecycle-cleanup.sql` | Mantenimiento periódico | Cada 3-6 meses |

> ⚠️ Si tuvieras archivos `migration-v2.sql` o `migration-v3.sql` de una versión anterior,
> ya no los necesitas. Su contenido fue consolidado en `policies.sql` y `schema.sql`.

---

## Modelo de datos (14 tablas)

```
settings          (singleton: pinCode, businessName, ...)
rate_config       (singleton: API elToque, markup, ...)
rates             (USD, MN, EUR, TRANSFERENCIA)
warehouses        (4 almacenes demo)
users             (perfil público, separado de auth.users)
managers          (gestores referidores)
cards             (tarjetas bancarias BPA/BANDEC/BANMET)
categories        (categorías de productos)
subcategories     (subcategorías)
products          (catálogo + units_per_box + wholesale_tiers)
stock             (inventario por warehouse×product, filtrado por almacén)
stock_movements   (auditoría de movimientos, filtrado por almacén)
sales             (ventas RETAIL + WHOLESALE, con client_ref unique, filtrado por almacén)
commission_payouts (marcas de comisión pagada)
```

---

## Seguridad RLS (Row Level Security)

### Funciones helper

| Función | Propósito |
|---------|-----------|
| `is_active_user()` | Usuario autenticado y activo |
| `is_admin()` | Usuario con rol 'admin' |
| `is_admin_or_gestor()` | Admin o gestor activo |
| `user_can_access_warehouse(uuid)` | ¿El usuario tiene acceso a este almacén? |

### Filtrado por almacén

Las tablas `stock`, `stock_movements` y `sales` usan `user_can_access_warehouse(warehouse_id)` en sus políticas RLS. Esto significa:

- **Admin:** ve todos los almacenes
- **Gestor/Vendedor:** solo ve los almacenes asignados en `users.warehouse_id` o `users.warehouse_ids[]`

Si solo usas 1 almacén o no necesitas segregar por usuario, puedes reemplazar las políticas para usar `is_active_user()` directamente.

---

## Ventas mayoristas (incluido en schema.sql desde v9)

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

### Funciones transaccionales (creadas en schema.sql)

| Function | Descripción |
|----------|-------------|
| `adjust_stock(...)` | Insert/update atómico de stock + auditoría |
| `update_sale_status(...)` | Cambio de estado de venta atómico (stock en tx) |
| `create_admin_user(...)` | Crea auth.user + perfil público en una transacción |

### Funciones de seguridad (creadas en policies.sql)

| Function | Descripción |
|----------|-------------|
| `change_user_password(uuid, text)` | Admin cambia contraseña sin exponer service_role |
| `deactivate_user(uuid)` | Soft-delete + ban automático en auth.users |
| `sync_user_warehouse_denorm()` | Trigger automático para denormalizar warehouse_name/code |

### Funciones helper RLS (creadas en policies.sql)

| Function | Descripción |
|----------|-------------|
| `is_admin()` | TRUE si el usuario actual es admin |
| `is_active_user()` | TRUE si el usuario actual está autenticado y activo |
| `is_admin_or_gestor()` | TRUE si es admin o gestor |
| `user_can_access_warehouse(uuid)` | TRUE si tiene acceso al almacén dado |

---

## Realtime

Las subscripciones en `db.js` (funciones `subscribe*`) usan **Supabase Realtime**.

Para verificar: **Database → Replication** → las tablas del schema `public`
deben estar en la publicación `supabase_realtime`. Si alguna no aparece:

```sql
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.stock;
alter publication supabase_realtime add table public.stock_movements;
alter publication supabase_realtime add table public.rates;
alter publication supabase_realtime add table public.warehouses;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.subcategories;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.managers;
alter publication supabase_realtime add table public.cards;
```

---

## Storage

2 buckets públicos creados automáticamente:

- `products` — imágenes de productos (WebP, < 5MB, con limpieza automática al borrar producto)
- `images` — imágenes genéricas

Políticas:
- **Lectura:** pública (cualquiera puede ver)
- **Escritura:** cualquier usuario autenticado
- **Borrado:** solo admin (limpieza de huérfanos desde el panel)

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
**Solución:** ejecuta `schema.sql` → `policies.sql` → `seed.sql` (en ese orden).

### Error: "column units_per_box does not exist"

Tu `schema.sql` es de una versión muy antigua (pre-v9).
**Solución:** descarga la última versión del repo y vuelve a ejecutar `schema.sql` (incluye todos los campos mayoristas).

### Error: "function user_can_access_warehouse does not exist"

Tu `policies.sql` es de una versión muy antigua.
**Solución:** descarga la última versión del repo y vuelve a ejecutar `policies.sql`.

### Las subscripciones realtime no funcionan

Verifica que las tablas estén en la publicación `supabase_realtime` (ver sección Realtime arriba).

### No puedo crear usuarios desde el panel admin

La RPC `create_admin_user` requiere que el caller esté autenticado como admin.
Verifica que tu usuario tenga `role = 'admin'` en la tabla `public.users`.

### Un vendedor ve ventas de otros almacenes

Las políticas RLS de `stock`, `stock_movements` y `sales` usan `user_can_access_warehouse()`.
Si no usas el filtrado por almacén, asigna todos los `warehouse_ids[]` correctamente al usuario,
o cambia las políticas para usar `is_active_user()` directamente (menos seguro).

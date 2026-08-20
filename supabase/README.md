# Supabase Backend · MANNOL POS

Este directorio contiene todos los scripts SQL necesarios para configurar
el backend de MANNOL POS en Supabase.

---

## 🚀 Instalación nueva (recomendada)

Si estás empezando desde cero, ejecuta en orden en **Supabase Dashboard → SQL Editor**:

1. **`schema.sql`** — Crea las 14 tablas + índices + 3 RPCs atómicas
2. **`policies.sql`** — Activa RLS + buckets de Storage + grants
3. **`seed.sql`** — Inserta datos demo (almacenes, productos con tiers mayorista, etc.)

> ✅ Desde la versión v9, `schema.sql` ya incluye los campos de ventas mayoristas
> (`units_per_box`, `wholesale_tiers`, `sale_type`, `boxes`, etc.). No necesitas
> ejecutar `migration-v2.sql` ni `migration-v3.sql` en una instalación nueva.

Después de ejecutar los 3 scripts, crea el primer usuario admin:
1. **Authentication → Users → Add user** → email + contraseña → marcar "Auto Confirm"
2. Copia el UUID del usuario
3. Ejecuta este SQL (reemplaza `<ADMIN_AUTH_UID>`):
```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

---

## 📦 Actualizar instalación existente

Si ya tienes la app funcionando y quieres añadir features nuevas:

| Quieres añadir... | Ejecuta... |
|--------------------|------------|
| RLS por warehouseIds + RPCs change_password/deactivate | `migration-v2.sql` |
| Ventas mayoristas (campos wholesale) | `migration-v3.sql` |

> ⚠️ **IMPORTANTE**: Los scripts `migration-*.sql` verifican que las tablas existan
> antes de ejecutarse. Si no las encuentras, te mostrarán un mensaje claro
> indicando que primero debes ejecutar `schema.sql`.

---

## Archivos

| Archivo | Descripción | Para qué sirve |
|---------|-------------|----------------|
| `schema.sql` | 14 tablas + índices + 3 RPCs + campos mayorista | Instalación nueva |
| `policies.sql` | RLS + buckets Storage + grants | Instalación nueva |
| `seed.sql` | Datos demo + productos con tiers mayorista | Instalación nueva |
| `migration-v2.sql` | RLS por warehouseIds + RPCs seguridad | Actualizar existente |
| `migration-v3.sql` | Campos de ventas mayoristas | Actualizar existente |

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
stock             (inventario por warehouse×product)
stock_movements   (auditoría de movimientos)
sales             (ventas RETAIL + WHOLESALE, con client_ref unique)
commission_payouts (marcas de comisión pagada)
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

- `products` — imágenes de productos (WebP, < 5MB)
- `images` — imágenes genéricas

Políticas: lectura pública, escritura autenticada.

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

Estás ejecutando `migration-v3.sql` sin haber ejecutado `schema.sql` primero.
**Solución**: ejecuta `schema.sql` → `policies.sql` → `seed.sql` (en ese orden).

### Error: "column units_per_box does not exist"

Tu `schema.sql` es de una versión anterior (pre-v9) que no incluye los campos mayoristas.
**Solución**: ejecuta `migration-v3.sql` (que añade los campos con `IF NOT EXISTS`).

### Las subscripciones realtime no funcionan

Verifica que las tablas estén en la publicación `supabase_realtime` (ver sección Realtime arriba).

### No puedo crear usuarios desde el panel admin

La RPC `create_admin_user` requiere que el caller esté autenticado como admin.
Verifica que tu usuario tenga `role = 'admin'` en la tabla `public.users`.

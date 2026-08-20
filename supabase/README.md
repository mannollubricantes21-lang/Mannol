# Supabase Backend · MANNOL POS

Este directorio contiene todos los scripts SQL necesarios para configurar
el backend de MANNOL POS en Supabase.

## Archivos

| Archivo        | Descripción                                            |
| -------------- | ------------------------------------------------------ |
| `schema.sql`   | 14 tablas + índices + 3 RPCs atómicas + 1 trigger     |
| `policies.sql` | RLS en todas las tablas + buckets de Storage + grants  |
| `seed.sql`     | Datos demo (settings, warehouses, managers, products) |

## Orden de ejecución

Ejecuta los scripts en este orden en **Supabase Dashboard → SQL Editor**:

1. `schema.sql`
2. `policies.sql`
3. `seed.sql`

## Modelo de datos (14 tablas)

```
settings          (singleton: pinCode, businessName, ...)
rate_config       (singleton: API elToque, markup, ...)
rates             (USD, MN, EUR, TRANSFERENCIA)
warehouses        (4 almacenes: Víbora, Lisa, Playa, Centro Habana)
users             (perfil público, separado de auth.users)
managers          (gestores referidores)
cards             (tarjetas bancarias BPA/BANDEC/BANMET)
categories        (categorías de productos)
subcategories     (subcategorías)
products          (catálogo MANNOL)
stock             (inventario por warehouse×product)
stock_movements   (auditoría de movimientos)
sales             (ventas, con client_ref UNIQUE para idempotencia)
commission_payouts (marcas de comisión pagada por manager×mes)
```

## RPCs (functions Postgres)

| Function               | Descripción                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `adjust_stock(...)`    | Insert/update atómico de stock + registro de movimiento de auditoría. |
| `update_sale_status()` | Cambio de estado de venta atómico (descuenta/restaura stock en tx).   |
| `create_admin_user()`  | Crea auth.user + perfil público en una sola transacción.               |
| `is_admin()`           | Helper RLS: ¿el usuario actual es admin?                               |
| `is_active_user()`     | Helper RLS: ¿el usuario actual está autenticado y activo?              |
| `is_admin_or_gestor()` | Helper RLS: admin o gestor activo.                                     |

## RLS (Row Level Security)

Resumen de permisos por tabla:

| Tabla                | Lectura                          | Escritura                |
| -------------------- | -------------------------------- | ------------------------ |
| settings             | público                          | admin                    |
| rate_config          | público                          | admin                    |
| rates                | público                          | usuario activo           |
| warehouses           | público                          | admin                    |
| managers             | público                          | admin                    |
| cards                | público                          | admin                    |
| categories           | público                          | admin                    |
| subcategories        | público                          | admin                    |
| products             | público                          | admin o gestor           |
| users                | self o admin                     | admin                    |
| stock                | usuario activo                   | usuario activo           |
| stock_movements      | usuario activo                   | usuario activo (create)  |
| sales                | usuario activo                   | create: usuario activo; update/delete: admin/gestor |
| commission_payouts   | usuario activo                   | admin                    |

## Storage

2 buckets públicos creados automáticamente:

- `products` — imágenes de productos (WebP, < 5MB)
- `images` — imágenes genéricas

Políticas: lectura pública, escritura autenticada.

## Crear el primer admin

Como las políticas RLS requieren que el caller esté autenticado, **el primer
admin debe crearse manualmente**:

1. **Authentication → Users → "Add user"**
2. Email: `admin@mannol.cu`, contraseña segura, marcar "Auto Confirm".
3. Copia el UUID del usuario.
4. Ejecuta este SQL:

```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

A partir de ahí, el admin puede crear más usuarios desde la UI (vista Users),
que internamente usa la RPC `create_admin_user`.

## Realtime

Las subscripciones en `db.js` (funciones `subscribe*`) usan **Supabase Realtime**
con `postgres_changes`. La configuración del proyecto habilita Realtime en el
schema `public` por defecto.

Para verificar: **Database → Replication** → la tabla `supabase_realtime`
debe listar las tablas del schema `public`. Si alguna no aparece, ejecuta:

```sql
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.stock;
alter publication supabase_realtime add table public.rates;
alter publication supabase_realtime add table public.warehouses;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.subcategories;
```

## Performance

Los índices clave (`schema.sql`):

- `idx_sales_warehouse_created` — listado de ventas por almacén ordenado por fecha.
- `idx_sales_client_ref` — verificación de idempotencia offline.
- `idx_stock_warehouse_product` — lookup de stock por almacén+producto.
- `idx_users_email` — login por email.
- `idx_stock_movements_warehouse_product` — auditoría de movimientos.

## Backup y migración

Para exportar todos los datos:

```bash
pg_dump --schema=public --data-only \
  "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
  > backup.sql
```

Para reimportar:

```bash
psql "postgresql://..." < backup.sql
```

Alternativamente, usa el **Table Editor** del dashboard para exportar CSV por tabla.

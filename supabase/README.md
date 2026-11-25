# Base de datos (Supabase) · MANNOL POS

Solo hay **un script que importa**: `instalar.sql`.

| Archivo | Para qué | ¿Obligatorio? |
| --- | --- | --- |
| `instalar.sql` | Crea o **actualiza** toda la base: tablas, funciones, permisos y los cambios de cada versión | **Sí** |
| `limpieza.sql` | Borra datos muy viejos para ahorrar espacio | No (mantenimiento) |

## Cómo se usa

1. Supabase → **SQL Editor** → **New query**.
2. Pega **todo** `instalar.sql` → **Run**.

Sirve igual para una base nueva y para la que ya usas: solo añade lo que falta,
**no borra datos**, y se puede ejecutar las veces que quieras. Cada vez que
actualices la app, vuelve a ejecutarlo y quedará al día.

> Antes había `schema.sql`, `policies.sql`, `seed.sql` y 15 archivos
> `migration-*.sql` que había que ejecutar en un orden concreto (y algunos
> fallaban). Todo eso está ahora dentro de `instalar.sql`, en el orden correcto.

## Primer administrador (solo en una base nueva)

1. **Authentication → Users → Add user**: email + contraseña, marca *Auto Confirm User*.
2. Copia su UUID y ejecuta (cambia `<UUID>`):

```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<UUID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
```

## Mantenimiento (opcional)

`limpieza.sql` borra movimientos de stock de más de 2 años y ventas canceladas
de más de 1 año. Haz una copia antes de ejecutarlo.

# Guía: ¿qué SQL debo ejecutar en Supabase? (MANNOL POS v5.1)

Responde esta pregunta en 2 minutos y sigue solo TU caso.

---

## Paso 0 — Averigua el estado de tu base de datos

1. Entra en **https://supabase.com** con tu cuenta.
2. Mira la lista de tus proyectos. Tu web está conectada al proyecto:
   `https://ightajxyvifpekuwamjz.supabase.co`
   - ¿Ves un proyecto cuya URL empiece por `ightajxyvifpekuwamjz`? → **es el tuyo**, sigue al punto 3.
   - ¿NO ves ningún proyecto con ese nombre/URL? → la web está conectada a un
     proyecto de otra persona. Necesitas crear el tuyo → ve al **Paso C**.
3. Entra en tu proyecto → menú lateral **Table Editor**:
   - ¿Aparecen tablas como `products`, `sales`, `stock`, `warehouses`?
     → **Tu BD YA está instalada** → ve al **Paso B**.
   - ¿No hay tablas o está vacío?
     → **Nunca se instaló** → ve al **Paso A**.

---

## Paso A — Instalación completa (base de datos vacía, nunca ejecutaste nada)

En **Supabase → SQL Editor → New query**, pega el contenido COMPLETO de cada
archivo y pulsa **Run**. Uno a la vez, en este orden:

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `supabase/schema.sql` | Crea las 14 tablas + índices + RPCs (ya incluye los motivos de transferencia) |
| 2 | `supabase/policies.sql` | Activa RLS, buckets de Storage y funciones de seguridad (incluye lectura de stock para PIN) |
| 3 | `supabase/seed.sql` | Datos iniciales: 4 almacenes, gestores de ejemplo (los del desplegable de ventas), tarjetas |

> `seed.sql` es opcional, pero **recomendado**: si no lo ejecutas, el
> desplegable "Gestor que refirió" saldrá vacío hasta que crees gestores
> desde el Admin. Puedes borrar/editar los gestores de ejemplo después.
>
> ❌ NO ejecutes `migration-v5.1-update.sql` en este caso: no hace falta,
> `schema.sql` ya lo incluye. (Ejecutarlo igualmente no rompe nada.)

### A.2 — Crear tu primer usuario admin (obligatorio)

1. **Authentication → Users → "Add user"** → escribe email y contraseña →
   marca **"Auto Confirm"** → Create.
2. Copia el **UUID** del usuario creado.
3. **SQL Editor → New query** (sustituye `<ADMIN_AUTH_UID>` por el UUID):

```sql
insert into public.users (auth_uid, username, display_name, email, role, active)
values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'TU@EMAIL.COM', 'admin', true);
```

4. Entra en la web con ese email y contraseña → ya eres admin.

### A.3 — Conectar la web a TU proyecto

Edita `js/supabase-config.js` con los datos de **Project Settings → API**
de tu proyecto y súbelo al repo (GitHub Pages lo toma automáticamente).

Alternativa sin tocar el repo: abre `setup.html` en tu web y usa el
asistente para guardar la configuración en cada dispositivo.

---

## Paso B — Tu BD ya existe (alguien ya ejecutó schema/policies)

Necesitas TRES scripts (en este orden):

1. **`supabase/migration-v5.1-update.sql`** → SQL Editor → pegar todo → Run.
   - Al terminar debe aparecer: `MIGRACIÓN v5.1 COMPLETADA`.
2. **`supabase/migration-v5.1.3-pin-stock.sql`** → SQL Editor → pegar todo → Run.
   - Al terminar verás 3 resultados: la lista de políticas de `stock`
     (debe incluir `stock_read_pin`), el total de filas de stock y el
     resumen almacén/producto/cantidad.
3. **`supabase/migration-v5.1.6-sales-pin.sql`** → SQL Editor → pegar todo → Run.
   - Necesario para que las ventas registradas por PIN se suban
     (si no, quedan "pendientes" para siempre). Al terminar verás las
     políticas de `sales` (deben incluir `sales_insert_pin` y
     `sales_read_pin`), el total de ventas y las últimas 5 ventas.

Los demás archivos no se tocan (`schema.sql`, `policies.sql`, `seed.sql`
ya están aplicados; `seed.sql` NO lo repitas para no duplicar datos demo).

---

## Problema: añadí stock y NO aparece / "Otros almacenes" carga eterno

**Causa:** los accesos por PIN de almacén no crean sesión de Supabase
(rol `anon`) y la tabla `stock` solo era legible para usuarios
autenticados. Es un problema de PERMISOS de la base de datos, no de la app.

**Solución:** ejecuta `supabase/migration-v5.1.3-pin-stock.sql`
(Paso B, script 2). Da lectura de stock a las sesiones PIN; modificar
stock sigue exigiendo admin/gestor.

**Diagnóstico extra (si tras el SQL sigues sin ver stock):**

```sql
select w.name as almacen, p.name as producto, s.quantity
from public.stock s
join public.warehouses w on w.id = s.warehouse_id
join public.products p on p.id = s.product_id
order by w.name, p.name;
```

- Devuelve filas → el stock existe; actualiza la app (dos veces) y entra de
  nuevo por PIN.
- Devuelve 0 filas → la entrada nunca llegó a guardarse (revisa que la
  usaste desde Admin → Stock → "Entrada de stock" con el toast de confirmación).

> Nota sobre usuarios de tipo "warehouse" (p. ej. `yandriel`): si en
> Table Editor ves su columna `warehouse_id = NULL` y `warehouse_ids = []`,
> ese usuario no tiene almacenes asignados. Solo afecta a sesiones con
> email + contraseña; para asignárselos ejecuta la sección opcional 3
> del script `migration-v5.1.3-pin-stock.sql`.

---

## Problema: registro una venta y se queda "pendiente", nunca se sube

**Causa:** exactamente la misma que el stock invisible — el acceso por
PIN no crea sesión de Supabase (rol `anon`) y la tabla `sales` solo
dejaría INSERTAR/LEER a usuarios autenticados. La app reintenta
subir la venta cada 30 segundos y falla en silencio con
`42501 new row violates row-level security policy for table "sales"`.

**Solución:** ejecuta `supabase/migration-v5.1.6-sales-pin.sql`
(Paso B, script 3). Da a las sesiones PIN permiso para registrar y
leer ventas. Las ventas que estaban atascadas en la cola se suben
solas en menos de 1 minuto tras ejecutar el SQL (la app reintenta sola).

---

## Paso C — Crear tu PROPIO proyecto Supabase

Si el proyecto `ightajxyvifpekuwamjz` no es tuyo, los datos (productos,
ventas, usuarios) viven en la cuenta de otra persona y podrías perderlos
en cualquier momento. Para independizarte:

1. **supabase.com → New project** → nombre, contraseña de BD, región.
   Espera ~2 min a que se aprovisione.
2. **Project Settings → API** → copia:
   - `Project URL` (algo como `https://xxxxx.supabase.co`)
   - `anon publishable key` (empieza por `sb_publishable_` o `eyJ...`)
3. Pega ambos en `js/supabase-config.js` y súbelo al repo.
4. Haz el **Paso A** completo (tu proyecto nuevo nace vacío).

---

## Cómo ejecutar un script (recordatorio)

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Pega el contenido COMPLETO del archivo `.sql` (ábrelo con el bloc de notas).
3. **Run** (Ctrl+Enter) → espera el mensaje **"Success. No rows returned"**
   (o el resultado que indique el propio script).
4. Un archivo por query. Si te dice "already exists" en algún elemento,
   es normal: los scripts de migración son idempotentes.

## Errores típicos

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `relation "public.products" does not exist` | Ejecutaste policies/seed antes que schema | Ejecuta `schema.sql` primero |
| `column brand ... violates not-null` | BD antigua sin marca | Ejecuta `migration-v5.1-update.sql` |
| `could not find the "commission" column` | Código viejo en caché | Refuerza recarga: Ctrl+Shift+R |
| La web no entra y muestra error de perfil | Falta el paso A.2 | Crea el admin con el INSERT |

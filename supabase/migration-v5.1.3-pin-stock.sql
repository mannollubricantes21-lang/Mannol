-- =====================================================
-- MIGRACIÓN v5.1.3 — Stock visible para accesos por PIN (anon)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar → Run
-- =====================================================
-- PROBLEMA QUE RESUELVE:
--   Los empleados entran al interior del almacén con un PIN.
--   Esa pantalla NO crea una sesión de Supabase (queda con rol
--   "anon"), y las políticas anteriores de la tabla stock solo
--   daban lectura a usuarios autenticados (admin/gestor con
--   email + contraseña).
--   Resultado: el stock añadido no aparecía en el almacén y la
--   pestaña "Otros almacenes" se quedaba cargando o vacía.
--
-- SOLUCIÓN: permitir LECTURA (solo lectura) del stock a las
--   sesiones anónimas del local. Modificar stock sigue exigiendo
--   sesión de admin/gestor (RPC adjust_stock ya lo garantiza).
--   Es el mismo nivel de exposición que ya tienen productos,
--   almacenes y precios (lectura pública).
-- =====================================================

-- 1) Lectura de stock para sesiones PIN (anon) — SOLO LECTURA
drop policy if exists "stock_read_pin" on public.stock;
create policy "stock_read_pin" on public.stock
  for select to anon
  using (true);

-- 2) (Opcional) Lectura de movimientos para sesiones PIN.
--    Descomenta las 3 líneas si algún día el interior del almacén
--    necesita mostrar el historial de movimientos.
-- drop policy if exists "stock_movements_read_pin" on public.stock_movements;
-- create policy "stock_movements_read_pin" on public.stock_movements
--   for select to anon
--   using (true);

-- 3) (Opcional) Asignar TODOS los almacenes activos al usuario "yandriel".
--    OJO: solo tiene efecto si ese usuario algún día inicia sesión con
--    email + contraseña (los accesos por PIN no consultan esta columna).
--    Para limitarlo a almacenes concretos usa la variante comentada abajo.
-- update public.users
-- set warehouse_ids = array(select id from public.warehouses where active = true),
--     warehouse_id  = (select id from public.warehouses where code = 'VIB')
-- where username = 'yandriel';

-- Variante restringida a 2 almacenes (cambia los códigos a los tuyos):
-- update public.users
-- set warehouse_ids = array[
--       (select id from public.warehouses where code = 'VIB'),
--       (select id from public.warehouses where code = 'LIS')
--     ],
--     warehouse_id = (select id from public.warehouses where code = 'VIB')
-- where username = 'yandriel';

-- =====================================================
-- VERIFICACIÓN (se ejecuta automáticamente al final)
-- =====================================================
-- A) La nueva política debe aparecer en la lista:
select 'POLITICAS DE STOCK' as paso, policyname, roles
from pg_policies
where tablename = 'stock'
order by policyname;

-- B) Cuenta las filas de stock reales en la base de datos.
--    Si total_filas = 0 → la entrada que hiciste NUNCA llegó a guardarse
--    (avísame). Si es > 0 → los datos están y con la política nueva
--    ya se verán en el interior del almacén.
select 'FILAS DE STOCK EN LA BD' as paso, count(*) as total_filas
from public.stock;

-- C) Resumen legible del stock por almacén y producto:
select w.name as almacen, p.name as producto, s.quantity
from public.stock s
join public.warehouses w on w.id = s.warehouse_id
join public.products p on p.id = s.product_id
order by w.name, p.name;

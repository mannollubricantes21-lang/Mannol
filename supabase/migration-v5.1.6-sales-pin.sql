-- =====================================================
-- MIGRACIÓN v5.1.6 — Las ventas se pueden registrar desde el PIN
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar → Run
-- =====================================================
-- PROBLEMA QUE RESUELVE:
--   Al registrar una venta desde un acceso por PIN, la venta
--   quedaba "pendiente" para siempre y nunca se subía (aparecía
--   el aviso "1 venta(s) pendiente(s)" y el admin no la veía).
--
-- CAUSA RAÍZ (la misma que el stock en v5.1.3):
--   El acceso por PIN NO crea una sesión de Supabase (rol "anon").
--   Las políticas de la tabla sales solo permitían INSERT/SELECT
--   a usuarios autenticados (email + contraseña). Resultado:
--   cada intento de subir la venta fallaba con
--   "new row violates row-level security policy for table sales"
--   y la venta se quedaba en la cola de sincronización.
--
-- SOLUCIÓN:
--   1) Permitir INSERT de ventas a las sesiones anónimas del local
--      (es como el vendedor apunta la venta en el cuaderno del
--      negocio; sin esto el POS no funciona por PIN).
--   2) Permitir SELECT de ventas a las sesiones anónimas, para que
--      el vendedor vea sus ventas en el panel (ventas de hoy,
--      historial) y la app pueda detectar ventas ya subidas y no
--      duplicarlas.
--   Editar/cancelar sigue pasando por la RPC update_sale_status
--   (security definer), que ya funcionaba con PIN.
-- =====================================================

-- 1) INSERT de ventas para sesiones PIN (anon)
drop policy if exists "sales_insert_pin" on public.sales;
create policy "sales_insert_pin" on public.sales
  for insert to anon
  with check (true);

-- 2) SELECT de ventas para sesiones PIN (anon)
drop policy if exists "sales_read_pin" on public.sales;
create policy "sales_read_pin" on public.sales
  for select to anon
  using (true);

-- =====================================================
-- VERIFICACIÓN (se ejecuta automáticamente al final)
-- =====================================================
-- A) Las 2 políticas nuevas deben aparecer en la lista:
select 'POLITICAS DE SALES' as paso, policyname, roles, cmd
from pg_policies
where tablename = 'sales'
order by policyname;

-- B) Total de ventas guardadas en la nube.
select 'TOTAL DE VENTAS EN LA NUBE' as paso, count(*) as total_ventas
from public.sales;

-- C) Últimas 5 ventas registradas (si acabas de activar esto y
--    re-sincronizaste las pendientes, deben aparecer aquí):
select 'ULTIMAS 5 VENTAS' as paso, code, warehouse_name, user_name,
       total_amount, status, created_at
from public.sales
order by created_at desc
limit 5;

-- =====================================================
-- MANNOL POS · Lifecycle cleanup (manual / cron)
-- =====================================================
-- Ejecutar periódicamente para evitar que la DB crezca sin control.
-- Plan free de Supabase: 500 MB DB, 5 GB Storage.
--
-- Recomendado: ejecutar mensualmente desde Supabase SQL Editor
--   o configurar pg_cron (requiere plan Pro).
--
-- IMPORTANTE: Haz backup antes de ejecutar. Los movimientos de
-- stock > 2 años no son útiles para auditoría operativa pero se
-- pueden exportar antes.
-- =====================================================

-- ===== 1. Borrar movimientos de stock antiguos =====
-- Conserva los últimos 730 días (2 años).
-- Ajusta el intervalo según necesidad.

DELETE FROM public.stock_movements
WHERE created_at < (now() - interval '730 days');

-- ===== 2. Borrar ventas canceladas antiguas (opcional) =====
-- Las ventas canceladas > 1 año ya no son operativas.
-- Mantén COMPLETADA y PENDIENTE por más tiempo para reporting.

DELETE FROM public.sales
WHERE status = 'CANCELADA'
  AND created_at < (now() - interval '365 days');

-- ===== 3. Compactar tablas (reclamar espacio) =====
-- Solo después de borrar muchas filas.

VACUUM ANALYZE public.stock_movements;
VACUUM ANALYZE public.sales;

-- ===== 4. Reporte de tamaño actual =====
-- Útil para monitoreo. Ejecutar antes/después del cleanup.

SELECT
  schemaname AS tabla,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS tamaño,
  pg_total_relation_size(schemaname || '.' || tablename) AS bytes
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'sales', 'stock_movements', 'products', 'users',
    'stock', 'warehouses', 'managers', 'cards',
    'categories', 'subcategories', 'rate_config', 'settings'
  )
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- ===== 5. Conteo de filas por tabla =====

SELECT 'sales' AS tabla, count(*) AS filas FROM public.sales
UNION ALL
SELECT 'stock_movements', count(*) FROM public.stock_movements
UNION ALL
SELECT 'products', count(*) FROM public.products
UNION ALL
SELECT 'users', count(*) FROM public.users
UNION ALL
SELECT 'stock', count(*) FROM public.stock
UNION ALL
SELECT 'warehouses', count(*) FROM public.warehouses
UNION ALL
SELECT 'managers', count(*) FROM public.managers
UNION ALL
SELECT 'cards', count(*) FROM public.cards
UNION ALL
SELECT 'commission_payouts', count(*) FROM public.commission_payouts
ORDER BY filas DESC;

-- ===== 6. Listar imágenes huérfanas en Storage (manual via Dashboard) =====
-- Storage no se puede consultar desde SQL. Ve a Supabase Dashboard →
-- Storage → products bucket y revisa los archivos sin referencia en
-- la tabla products.

-- Para borrar huérfanas desde la app, abre el panel admin → Productos
-- y usa el botón "Eliminar" (ya borra la imagen automáticamente).

-- ===== 7. Configurar pg_cron (solo plan Pro) =====
-- Descomentar en plan Pro para automatizar el cleanup mensual.

/*
-- Habilitar extensión
create extension if not exists pg_cron;

-- Programar limpieza mensual (día 1 de cada mes a las 3 AM UTC)
select cron.schedule(
  'mannol-monthly-cleanup',
  '0 3 1 * *',
  $$
  DELETE FROM public.stock_movements
  WHERE created_at < (now() - interval '730 days');
  DELETE FROM public.sales
  WHERE status = 'CANCELADA'
    AND created_at < (now() - interval '365 days');
  VACUUM ANALYZE public.stock_movements;
  VACUUM ANALYZE public.sales;
  $$
);
*/

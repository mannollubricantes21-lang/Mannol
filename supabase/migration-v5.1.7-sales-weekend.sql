-- =====================================================
-- MIGRACIÓN v5.1.7 — Columnas faltantes de ventas y configuración
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar → Run
-- =====================================================
-- PROBLEMA QUE RESUELVE:
--   Las ventas seguían fallando ("0 sincronizadas, N fallaron")
--   incluso después del SQL de permisos v5.1.6, porque la base de
--   datos NUNCA recibió la migración v2 (comisiones + fin de semana)
--   y le faltan columnas que la app envía en cada venta:
--     sales.weekend_redirect         (regla de fin de semana)
--     sales.original_warehouse_id    (auditoría de reasignación)
--     sales.weekend_warehouse_id     (auditoría de reasignación)
--   Y en la tabla de configuración:
--     settings.weekend_warehouse_id
--     settings.weekend_redirect_enabled
--   Cada intento de subir una venta fallaba con:
--     PGRST204 "Could not find the 'weekend_redirect' column"
--
-- Es IDEMPOTENTE: puedes ejecutarlo las veces que quieras, no
-- duplica nada y no toca los datos existentes.
-- =====================================================

-- 1) Columnas de auditoría de fin de semana en VENTAS
alter table public.sales
  add column if not exists weekend_redirect boolean not null default false;

alter table public.sales
  add column if not exists original_warehouse_id uuid references public.warehouses(id) on delete set null;

alter table public.sales
  add column if not exists weekend_warehouse_id uuid references public.warehouses(id) on delete set null;

-- 2) Columnas de configuración de fin de semana en SETTINGS
alter table public.settings
  add column if not exists weekend_warehouse_id uuid references public.warehouses(id) on delete set null;

alter table public.settings
  add column if not exists weekend_redirect_enabled boolean not null default false;

-- 3) Índices para reportes (mismos que la migración v2)
create index if not exists idx_sales_weekend_redirect
  on public.sales (weekend_redirect) where weekend_redirect = true;

create index if not exists idx_sales_original_warehouse
  on public.sales (original_warehouse_id) where original_warehouse_id is not null;

-- =====================================================
-- VERIFICACIÓN (se ejecuta automáticamente al final)
-- =====================================================
-- Deben aparecer las 5 columnas nuevas:
select 'COLUMNAS DE SALES' as paso, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'sales'
  and column_name in ('weekend_redirect','original_warehouse_id','weekend_warehouse_id','sale_type','synced_at')
order by column_name;

select 'COLUMNAS DE SETTINGS' as paso, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'settings'
  and column_name in ('weekend_warehouse_id','weekend_redirect_enabled')
order by column_name;

-- Conteo de ventas ya sincronizadas (tras ejecutar este SQL y abrir la
-- app, las ventas "pendientes" deben subir solas en menos de 1 minuto):
select 'VENTAS EN LA NUBE' as paso, count(*) as total_ventas from public.sales;

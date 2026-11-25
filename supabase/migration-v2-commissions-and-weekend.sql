-- =====================================================
-- MANNOL POS · Migration v2 — Comisiones mejoradas + fin de semana
-- =====================================================
-- Este script AÑADE columnas nuevas a tablas existentes y crea
-- una tabla nueva (weekend_warehouse_config). Es SEGURO correrlo
-- sobre una instalación existente con datos — no borra nada.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================

-- =====================================================
-- 1. managers: añadir tipo + comisión flexible + moneda
-- =====================================================

-- 1a. Tipo de gestor: 'LOCAL' (trabaja en un almacén) o 'REFERRER' (referidor que lleva clientes)
alter table public.managers
  add column if not exists manager_type text not null default 'REFERRER'
  check (manager_type in ('LOCAL','REFERRER'));

-- 1b. Tipo de comisión: 'PERCENT' (porcentaje del total) o 'FIXED' (valor fijo por venta)
alter table public.managers
  add column if not exists commission_type text not null default 'PERCENT'
  check (commission_type in ('PERCENT','FIXED'));

-- 1c. Moneda de la comisión (USD o MN). Para comisión FIXED, en qué moneda se paga.
alter table public.managers
  add column if not exists commission_currency text not null default 'USD'
  check (commission_currency in ('USD','MN'));

-- 1d. Si es LOCAL, a qué almacén pertenece (nullable para REFERRER)
alter table public.managers
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null;

-- 1e. Comentario/descripción libre para que el admin recuerde qué tipo de gestor es
alter table public.managers
  add column if not exists notes text;

-- =====================================================
-- 2. warehouses: porcentaje de comisión del vendedor local ya existe
--    (seller_commission_percent + seller_commission_currency)
--    No hay cambios en warehouses.
-- =====================================================

-- =====================================================
-- 3. sales: marcar ventas que se reasignaron por regla fin de semana
-- =====================================================

-- 3a. Si la venta fue reasignada por regla de fin de semana, guardamos el
--     almacén ORIGINAL del vendedor para auditoría.
alter table public.sales
  add column if not exists original_warehouse_id uuid references public.warehouses(id) on delete set null;

-- 3b. Flag para indicar que la venta fue reasignada (ej: sábado → Vedado)
alter table public.sales
  add column if not exists weekend_redirect boolean not null default false;

-- 3c. ID del almacén que recibe las ventas de fin de semana (denormalizado
--     para saber rápido cuál fue, sin joins — aunque original_warehouse_id ya lo dice)
alter table public.sales
  add column if not exists weekend_warehouse_id uuid references public.warehouses(id) on delete set null;

-- =====================================================
-- 4. settings: configuración global de fin de semana
-- =====================================================
-- Añadimos columnas a la tabla settings (singleton) para guardar:
-- - weekend_warehouse_id: qué almacén recibe las ventas de sábado/domingo
-- - weekend_redirect_enabled: si la regla está activada o no

alter table public.settings
  add column if not exists weekend_warehouse_id uuid references public.warehouses(id) on delete set null;

alter table public.settings
  add column if not exists weekend_redirect_enabled boolean not null default false;

-- =====================================================
-- 5. Índices nuevos para performance
-- =====================================================

create index if not exists idx_managers_type on public.managers (manager_type);
create index if not exists idx_managers_warehouse on public.managers (warehouse_id) where manager_type = 'LOCAL';
create index if not exists idx_sales_weekend_redirect on public.sales (weekend_redirect) where weekend_redirect = true;
create index if not exists idx_sales_original_warehouse on public.sales (original_warehouse_id) where original_warehouse_id is not null;

-- =====================================================
-- 6. Comentario informativo
-- =====================================================
comment on table public.managers is 'Gestores. manager_type = LOCAL (trabaja en un almacén, su comisión sale de las ventas de ese almacén) o REFERRER (referidor que lleva clientes, su comisión sale de las ventas que refiere). commission_type = PERCENT (porcentaje del total) o FIXED (valor fijo por venta).';

comment on column public.managers.manager_type is 'LOCAL = gestor que trabaja en un almacén específico (warehouse_id obligatorio). REFERRER = referidor que lleva clientes a cualquier almacén.';
comment on column public.managers.commission_type is 'PERCENT = la columna "commission" es un porcentaje del total vendido. FIXED = la columna "commission" es un valor fijo por venta.';
comment on column public.managers.commission_currency is 'Moneda en que se paga la comisión. USD o MN.';
comment on column public.managers.warehouse_id is 'Si manager_type = LOCAL, almacén al que pertenece el gestor. NULL para REFERRER.';

comment on column public.sales.weekend_redirect is 'TRUE si la venta fue reasignada por regla de fin de semana (sábado/domingo → almacén configurado).';
comment on column public.sales.original_warehouse_id is 'Si weekend_redirect = true, almacén ORIGINAL del vendedor (antes de la reasignación).';
comment on column public.sales.weekend_warehouse_id is 'Si weekend_redirect = true, almacén al que se reasignó la venta.';

comment on column public.settings.weekend_warehouse_id is 'Almacén que recibe las ventas de sábado/domingo. Si es NULL, la regla no aplica.';
comment on column public.settings.weekend_redirect_enabled is 'TRUE = activa la regla de reasignación de ventas de fin de semana.';

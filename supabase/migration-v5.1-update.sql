-- =====================================================
-- Migración v5.1 — Actualización completa para la versión 5.1
-- =====================================================
-- Este archivo es TODO EN UNO, IDEMPOTENTE y SEGURO:
-- puedes ejecutarlo varias veces sin romper nada.
--
-- Qué hace:
--   1) Asegura en `products` todas las columnas que la app v5.1
--      puede enviar (por si tu base de datos es de una versión antigua).
--      Rellena `brand` con 'MANNOL' si alguna fila no lo tiene.
--   2) Amplía el CHECK de `stock_movements.reason` para aceptar los
--      motivos de transferencia TRANSFERENCIA_SALIDA / TRANSFERENCIA_ENTRADA
--      (sin esto, confirmar una transferencia falla y el stock no se mueve).
--   3) Añade las tablas del schema `public` a la publicación
--      `supabase_realtime` (silencioso si ya estaban).
--
-- CÓMO EJECUTARLO:
--   Supabase Dashboard → SQL Editor → New query →
--   pegar TODO este archivo → Run.
--   Si al final ves "MIGRACIÓN v5.1 COMPLETADA", todo quedó bien.
-- =====================================================

-- ------------------------------------------------------------
-- 1) Columnas de products (solo se añaden si NO existen)
-- ------------------------------------------------------------
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists viscosity text;
alter table public.products add column if not exists volume_liters numeric;
alter table public.products add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.products add column if not exists category_name text;
alter table public.products add column if not exists subcategory_id uuid references public.subcategories(id) on delete set null;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists cost_price numeric not null default 0;
alter table public.products add column if not exists sale_price numeric not null default 0;
alter table public.products add column if not exists min_stock int not null default 0;
alter table public.products add column if not exists gestor_commission numeric not null default 0;
alter table public.products add column if not exists gestor_commission_currency text not null default 'USD';
alter table public.products add column if not exists vendor_commission numeric not null default 0;
alter table public.products add column if not exists vendor_commission_currency text not null default 'USD';
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists active boolean not null default true;
alter table public.products add column if not exists units_per_box int;
alter table public.products add column if not exists wholesale_tiers jsonb default '[]';
alter table public.products add column if not exists created_at timestamptz not null default now();

-- Rellenar marca vacía y activar el NOT NULL (el catálogo antiguo no pedía marca)
update public.products set brand = 'MANNOL' where brand is null or btrim(brand) = '';
alter table public.products alter column brand set not null;

-- ------------------------------------------------------------
-- 2) Motivos de transferencia en stock_movements (igual que la v4)
-- ------------------------------------------------------------
alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;

alter table public.stock_movements
  add constraint stock_movements_reason_check
  check (reason in (
    'AJUSTE_MANUAL',
    'INVENTARIO',
    'MERMA',
    'DEVOLUCION',
    'VENTA',
    'CANCELACION',
    'REABRIR',
    'TRANSFERENCIA_SALIDA',
    'TRANSFERENCIA_ENTRADA'
  ));

-- ------------------------------------------------------------
-- 3) Realtime: asegurar las tablas en supabase_realtime
-- ------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'sales','stock','stock_movements','rates','warehouses',
    'products','categories','subcategories','users','managers','cards'
  ];
begin
  foreach t in array tablas loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- ya estaba en la publicación (o no existe): ignorar
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select 'MIGRACIÓN v5.1 COMPLETADA' as resultado;

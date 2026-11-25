-- =====================================================
-- MANNOL POS · Migración v5.14 — Vendedores de cada almacén
-- =====================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar → Run.
-- Idempotente: se puede re-ejecutar sin romper nada ni duplicar.
--
-- Para qué: cada vendedor ve en su pantalla lo que lleva ganado en el mes
-- (monto fijo por producto vendido, el que configuras en cada producto).
-- En Admin → Almacenes indicas quién vende en cada uno:
--   · una persona (lo normal), o
--   · dos personas: una de lunes a viernes y otra sábado y domingo.
--     Cada venta cuenta para quien trabaja ese día.
--
-- Qué hace: añade 3 columnas a `warehouses` (no toca ni borra datos).
--   seller_weekend_split  → true = dos vendedores (L-V y fin de semana)
--   seller_name           → nombre del vendedor (o el de lunes a viernes)
--   seller_weekend_name   → nombre del de sábado y domingo
-- Las políticas de acceso de `warehouses` ya cubren las columnas nuevas.
-- =====================================================

alter table public.warehouses
  add column if not exists seller_weekend_split boolean not null default false;

alter table public.warehouses
  add column if not exists seller_name text;

alter table public.warehouses
  add column if not exists seller_weekend_name text;

comment on column public.warehouses.seller_weekend_split is
  'v5.14: true = en este almacén venden dos personas: una de lunes a viernes (seller_name) y otra sábado y domingo (seller_weekend_name). Las comisiones de cada venta se cuentan para quien trabaja ese día.';
comment on column public.warehouses.seller_name is
  'v5.14: nombre del vendedor del almacén (o el de lunes a viernes si seller_weekend_split). Opcional.';
comment on column public.warehouses.seller_weekend_name is
  'v5.14: nombre del vendedor de sábado y domingo (solo si seller_weekend_split). Opcional.';

-- Que la API vea las columnas nuevas sin esperar
notify pgrst, 'reload schema';

-- -----------------------------------------------------
-- Verificación
-- -----------------------------------------------------
select 'MIGRACIÓN v5.14 COMPLETADA' as resultado,
       (select count(*) from public.warehouses) as almacenes,
       (select count(*) from public.warehouses where seller_weekend_split) as con_dos_vendedores;

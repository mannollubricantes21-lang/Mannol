-- =====================================================
-- MANNOL POS · Actualización v3 — Ventas Mayoristas
-- =====================================================
-- Ejecutar DESPUÉS de schema.sql + policies.sql + seed.sql + migration-v2.sql.
-- Añade soporte para ventas mayoristas (por cajas) con precios escalonados.
-- =====================================================

-- =====================================================
-- 1. products: añadir units_per_box + wholesale_tiers
-- =====================================================
-- units_per_box: cuántos pomos/botellas trae una caja (nullable = no mayorista)
-- wholesale_tiers: array JSON con escalones de precio por cantidad de cajas

alter table public.products add column if not exists units_per_box int;
alter table public.products add column if not exists wholesale_tiers jsonb default '[]';

-- Ejemplo de wholesale_tiers:
-- [
--   { "minBoxes": 1,  "maxBoxes": 5,   "pricePerUnit": 22, "vendorCommission": 0.50, "gestorCommission": 0.30 },
--   { "minBoxes": 6,  "maxBoxes": 20,  "pricePerUnit": 20, "vendorCommission": 0.75, "gestorCommission": 0.40 },
--   { "minBoxes": 21, "maxBoxes": null,"pricePerUnit": 18, "vendorCommission": 1.00, "gestorCommission": 0.50 }
-- ]

-- =====================================================
-- 2. sales: añadir campos de venta mayorista
-- =====================================================
-- sale_type: 'RETAIL' (venta por unidad, default) o 'WHOLESALE' (por caja)
-- boxes: cantidad de cajas vendidas (null si RETAIL)
-- price_per_box: precio negociado por caja (null si RETAIL)
-- vendor_commission_per_box: comisión del vendedor por caja (null si RETAIL)
-- gestor_commission_per_box: comisión del gestor por caja (null si RETAIL)

alter table public.sales add column if not exists sale_type text not null default 'RETAIL'
  check (sale_type in ('RETAIL','WHOLESALE'));
alter table public.sales add column if not exists boxes int;
alter table public.sales add column if not exists price_per_box numeric;
alter table public.sales add column if not exists vendor_commission_per_box numeric;
alter table public.sales add column if not exists gestor_commission_per_box numeric;

-- Asegurar que ventas WHOLESALE tengan boxes y price_per_box
-- (no se puede hacer con CHECK constraint que valide JSON, se valida en app)

-- =====================================================
-- 3. Índices para reportes por tipo de venta
-- =====================================================
create index if not exists idx_sales_type on public.sales (sale_type);
create index if not exists idx_sales_type_created on public.sales (sale_type, created_at desc);
create index if not exists idx_products_wholesale on public.products (units_per_box) where units_per_box is not null;

-- =====================================================
-- 4. Comentario documental
-- =====================================================
comment on column public.products.units_per_box is 'Cantidad de pomos/botellas por caja. NULL = el producto no se vende al por mayor.';
comment on column public.products.wholesale_tiers is 'Array JSON de escalones de precio mayorista. Cada tier: {minBoxes, maxBoxes, pricePerUnit, vendorCommission, gestorCommission}.';
comment on column public.sales.sale_type is 'RETAIL = venta por unidad, WHOLESALE = venta por caja.';
comment on column public.sales.boxes is 'Cantidad de cajas vendidas (solo WHOLESALE).';
comment on column public.sales.price_per_box is 'Precio negociado por caja (solo WHOLESALE). Editable al registrar.';
comment on column public.sales.vendor_commission_per_box is 'Comisión del vendedor por caja (solo WHOLESALE). Editable al registrar.';
comment on column public.sales.gestor_commission_per_box is 'Comisión del gestor por caja (solo WHOLESALE).';

-- =====================================================
-- 5. Seed: añadir units_per_box y tiers a productos existentes
-- =====================================================
-- Solo se aplican a productos que ya existen con unitsPerBox > 0
-- No toca productos sin configuración mayorista.

update public.products set units_per_box = 6, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":22,"vendorCommission":0.50,"gestorCommission":0.30},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":20,"vendorCommission":0.75,"gestorCommission":0.40},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":18,"vendorCommission":1.00,"gestorCommission":0.50}
]'::jsonb where units_per_box is null and name ilike '%5W-30%';

update public.products set units_per_box = 6, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":20,"vendorCommission":0.50,"gestorCommission":0.25},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":18,"vendorCommission":0.70,"gestorCommission":0.35},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":16,"vendorCommission":0.90,"gestorCommission":0.45}
]'::jsonb where units_per_box is null and name ilike '%10W-40%';

update public.products set units_per_box = 6, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":15,"vendorCommission":0.40,"gestorCommission":0.20},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":14,"vendorCommission":0.60,"gestorCommission":0.30},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":13,"vendorCommission":0.80,"gestorCommission":0.40}
]'::jsonb where units_per_box is null and name ilike '%15W-40%';

update public.products set units_per_box = 4, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":27,"vendorCommission":0.60,"gestorCommission":0.35},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":25,"vendorCommission":0.90,"gestorCommission":0.45},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":23,"vendorCommission":1.20,"gestorCommission":0.60}
]'::jsonb where units_per_box is null and name ilike '%Diesel%';

update public.products set units_per_box = 4, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":3,"pricePerUnit":34,"vendorCommission":0.80,"gestorCommission":0.50},
  {"minBoxes":4,"maxBoxes":15,"pricePerUnit":32,"vendorCommission":1.10,"gestorCommission":0.65},
  {"minBoxes":16,"maxBoxes":null,"pricePerUnit":30,"vendorCommission":1.40,"gestorCommission":0.80}
]'::jsonb where units_per_box is null and name ilike '%Premium%';

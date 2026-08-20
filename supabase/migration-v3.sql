-- =====================================================
-- MANNOL POS · Actualización v3 — Ventas Mayoristas
-- =====================================================
-- IMPORTANTE: Este script es SOLO para instalaciones existentes
-- que ya tienen las tablas creadas (ejecutaron schema.sql antes).
--
-- Si es una instalación NUEVA:
--   → NO ejecutes este script
--   → Ejecuta SOLO: schema.sql → policies.sql → seed.sql
--   (schema.sql ya incluye los campos mayoristas desde v9)
--
-- Si ya tienes la app funcionando y quieres añadir mayorista:
--   → Ejecuta ESTE script (migration-v3.sql)
-- =====================================================

-- =====================================================
-- VERIFICACIÓN: ¿existe la tabla products?
-- =====================================================
-- Si no existe, abortar con mensaje claro

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    raise exception '
╔══════════════════════════════════════════════════════════╗
║  ERROR: La tabla public.products no existe               ║
║                                                          ║
║  Esto significa que NO has ejecutado schema.sql todavía. ║
║                                                          ║
║  SOLUCIÓN:                                               ║
║  1. Ejecuta schema.sql primero (crea todas las tablas)   ║
║  2. Ejecuta policies.sql (seguridad RLS)                 ║
║  3. Ejecuta seed.sql (datos demo + tiers mayorista)      ║
║                                                          ║
║  NO necesitas ejecutar este migration-v3.sql si es       ║
║  instalación nueva — schema.sql ya incluye los campos    ║
║  mayoristas desde la versión v9.                         ║
╚══════════════════════════════════════════════════════════╝
';
  end if;
end
$$;

-- =====================================================
-- 1. products: añadir units_per_box + wholesale_tiers
-- =====================================================
-- Solo se ejecuta si las columnas no existen aún (IF NOT EXISTS)

alter table public.products add column if not exists units_per_box int;
alter table public.products add column if not exists wholesale_tiers jsonb default '[]';

-- =====================================================
-- 2. sales: añadir campos de venta mayorista
-- =====================================================

alter table public.sales add column if not exists sale_type text not null default 'RETAIL'
  check (sale_type in ('RETAIL','WHOLESALE'));
alter table public.sales add column if not exists boxes int;
alter table public.sales add column if not exists price_per_box numeric;
alter table public.sales add column if not exists vendor_commission_per_box numeric;
alter table public.sales add column if not exists gestor_commission_per_box numeric;

-- =====================================================
-- 3. Índices para reportes por tipo de venta
-- =====================================================

create index if not exists idx_sales_type on public.sales (sale_type);
create index if not exists idx_sales_type_created on public.sales (sale_type, created_at desc);
create index if not exists idx_products_wholesale on public.products (units_per_box) where units_per_box is not null;

-- =====================================================
-- 4. Comentarios documentales
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
-- Solo se aplica a productos que ya existen y no tienen units_per_box configurado.

update public.products set units_per_box = 6, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":22,"vendorCommission":0.50,"gestorCommission":0.30},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":20,"vendorCommission":0.75,"gestorCommission":0.40},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":18,"vendorCommission":1.00,"gestorCommission":0.50}
]'::jsonb where units_per_box is null and sku = 'MN-7511';

update public.products set units_per_box = 6, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":20,"vendorCommission":0.50,"gestorCommission":0.25},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":18,"vendorCommission":0.70,"gestorCommission":0.35},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":16,"vendorCommission":0.90,"gestorCommission":0.45}
]'::jsonb where units_per_box is null and sku = 'MN-7512';

update public.products set units_per_box = 6, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":15,"vendorCommission":0.40,"gestorCommission":0.20},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":14,"vendorCommission":0.60,"gestorCommission":0.30},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":13,"vendorCommission":0.80,"gestorCommission":0.40}
]'::jsonb where units_per_box is null and sku = 'MN-7515';

update public.products set units_per_box = 4, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":5,"pricePerUnit":27,"vendorCommission":0.60,"gestorCommission":0.35},
  {"minBoxes":6,"maxBoxes":20,"pricePerUnit":25,"vendorCommission":0.90,"gestorCommission":0.45},
  {"minBoxes":21,"maxBoxes":null,"pricePerUnit":23,"vendorCommission":1.20,"gestorCommission":0.60}
]'::jsonb where units_per_box is null and sku = 'MN-7521';

update public.products set units_per_box = 4, wholesale_tiers = '[
  {"minBoxes":1,"maxBoxes":3,"pricePerUnit":34,"vendorCommission":0.80,"gestorCommission":0.50},
  {"minBoxes":4,"maxBoxes":15,"pricePerUnit":32,"vendorCommission":1.10,"gestorCommission":0.65},
  {"minBoxes":16,"maxBoxes":null,"pricePerUnit":30,"vendorCommission":1.40,"gestorCommission":0.80}
]'::jsonb where units_per_box is null and sku = 'MN-7531';

-- =====================================================
-- Confirmación
-- =====================================================
do $$
begin
  raise notice '
╔══════════════════════════════════════════════════════════╗
║  ✓ Migración v3 (mayorista) aplicada correctamente      ║
║                                                          ║
║  Cambios:                                                ║
║  • Tabla products: + units_per_box, + wholesale_tiers   ║
║  • Tabla sales: + sale_type, boxes, price_per_box,     ║
║    vendor_commission_per_box, gestor_commission_per_box║
║  • 5 productos configurados con tiers mayoristas        ║
║  • 3 índices nuevos para reportes                        ║
║                                                          ║
║  Ya puedes usar "Venta mayorista" en el POS.            ║
╚══════════════════════════════════════════════════════════╝
';
end
$$;

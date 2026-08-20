-- =====================================================
-- MANNOL POS · Esquema de base de datos para Supabase
-- =====================================================
-- Reemplaza firestore.rules + firestore.indexes.json de la versión Firebase.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- =====================================================

-- Extensión pgcrypto para gen_random_uuid()
create extension if not exists pgcrypto;

-- =====================================================
-- Tablas
-- =====================================================
-- Convención: snake_case en columnas Postgres (idiomático).
-- db.js se encarga de mapear camelCase (JS) ↔ snake_case (DB).

-- 1. settings (singleton — id siempre 'global')
create table if not exists public.settings (
  id text primary key default 'global',
  pin_code text not null default '2025',
  el_toque_enabled boolean not null default true,
  el_toque_markup numeric not null default 5,
  business_name text not null default 'MANNOL',
  last_rate_sync timestamptz
);

-- 2. rate_config (singleton — id siempre 'default')
create table if not exists public.rate_config (
  id text primary key default 'default',
  api_url text,
  api_token text,
  markup_mode text not null default 'PERCENT' check (markup_mode in ('PERCENT','FIXED')),
  markup_usd numeric not null default 5,
  markup_eur numeric not null default 5,
  manual_usd_rate numeric not null default 320,
  manual_eur_rate numeric not null default 345,
  last_sync_at timestamptz,
  last_usd_rate numeric,
  last_eur_rate numeric,
  cache_ttl_minutes int not null default 60,
  auto_sync boolean not null default true
);

-- 3. rates (4 filas: USD, MN, EUR, TRANSFERENCIA)
create table if not exists public.rates (
  currency text primary key,
  rate_usd numeric not null default 1,
  source text not null default 'manual' check (source in ('manual','api')),
  updated_at timestamptz not null default now()
);

-- 4. warehouses
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  phone text,
  active boolean not null default true,
  pin text,
  seller_commission_percent numeric not null default 0,
  seller_commission_currency text not null default 'USD' check (seller_commission_currency in ('USD','MN')),
  created_at timestamptz not null default now()
);

-- 5. users (perfil público, separado de auth.users)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid unique,  -- referencia a auth.users(id)
  username text not null unique,
  display_name text not null,
  email text not null unique,
  role text not null check (role in ('admin','gestor','vendedor','warehouse','empleado_pin')),
  active boolean not null default true,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  warehouse_ids uuid[] default '{}',
  warehouse_name text,  -- cache denormalizado
  warehouse_code text,
  commission_rate numeric not null default 0,
  created_at timestamptz not null default now()
);

-- 6. managers (gestores referidores)
create table if not exists public.managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  phone text,
  email text,
  commission numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 7. cards (tarjetas bancarias)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number text not null,
  bank text check (bank in ('BPA','BANDEC','BANMET') or bank is null),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 8. categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  color text not null default 'slate',
  icon text,
  parent_id uuid references public.categories(id) on delete cascade,
  sort_order int not null default 0,  -- unificado (antes 'order'/'sortOrder')
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 9. subcategories
create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 10. products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  sku text,
  viscosity text,
  volume_liters numeric,
  category_id uuid references public.categories(id) on delete set null,
  category_name text,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  description text,
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  min_stock int not null default 0,
  gestor_commission numeric not null default 0,
  gestor_commission_currency text not null default 'USD' check (gestor_commission_currency in ('USD','MN')),
  vendor_commission numeric not null default 0,
  vendor_commission_currency text not null default 'USD' check (vendor_commission_currency in ('USD','MN')),
  image_url text,
  active boolean not null default true,
  -- Mayorista (Opción B)
  units_per_box int,  -- pomos/botellas por caja. NULL = no mayorista
  wholesale_tiers jsonb default '[]',  -- [{minBoxes, maxBoxes, pricePerUnit, vendorCommission, gestorCommission}]
  created_at timestamptz not null default now()
);

-- 11. stock (id compuesto: `${warehouseId}_${productId}`)
create table if not exists public.stock (
  id text primary key,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null default 0,
  local_price numeric,
  min_stock int default 0,
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

-- 12. stock_movements (auditoría)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  delta numeric not null,
  reason text not null check (reason in ('AJUSTE_MANUAL','INVENTARIO','MERMA','DEVOLUCION','VENTA','CANCELACION','REABRIR')),
  note text,
  user_id uuid,
  user_name text,
  created_at timestamptz not null default now()
);

-- 13. sales (client_ref UNIQUE para idempotencia offline)
create table if not exists public.sales (
  id text primary key,
  code text,
  client_ref text unique,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  warehouse_name text,
  warehouse_code text,
  user_id uuid,
  user_name text,
  manager_id uuid references public.managers(id) on delete set null,
  manager_name text,
  manager_code text,
  customer_name text,
  items jsonb not null default '[]',
  total_amount numeric not null default 0,
  total_usd numeric not null default 0,
  payments jsonb not null default '[]',
  is_multi_currency boolean not null default false,
  payment_mode text not null default 'SINGLE' check (payment_mode in ('SINGLE','MULTI')),
  currency text not null default 'USD',
  paid_usd numeric not null default 0,
  paid_mn numeric not null default 0,
  paid_eur numeric not null default 0,
  paid_transfer numeric not null default 0,
  payment_method text check (payment_method in ('EFECTIVO','TRANSFERENCIA') or payment_method is null),
  card_id uuid,
  card_number text,
  card_name text,
  transfer_amount numeric not null default 0,
  note text,
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE','COMPLETADA','CANCELADA')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  gestor_commission_usd numeric not null default 0,
  gestor_commission_mn numeric not null default 0,
  vendor_commission_usd numeric not null default 0,
  vendor_commission_mn numeric not null default 0,
  -- Mayorista (Opción B)
  sale_type text not null default 'RETAIL' check (sale_type in ('RETAIL','WHOLESALE')),
  boxes int,  -- cajas vendidas (solo WHOLESALE)
  price_per_box numeric,  -- precio negociado por caja (solo WHOLESALE)
  vendor_commission_per_box numeric,  -- comisión vendedor por caja
  gestor_commission_per_box numeric,  -- comisión gestor por caja
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

-- 14. commission_payouts (id compuesto)
create table if not exists public.commission_payouts (
  id text primary key,
  manager_id uuid not null references public.managers(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  paid_at timestamptz not null default now(),
  paid_by uuid,
  unique (manager_id, year, month)
);

-- =====================================================
-- Índices
-- =====================================================

create index if not exists idx_sales_warehouse_created on public.sales (warehouse_id, created_at desc);
create index if not exists idx_sales_user_created on public.sales (user_id, created_at desc);
create index if not exists idx_sales_manager_id on public.sales (manager_id);
create index if not exists idx_sales_status on public.sales (status);
create index if not exists idx_sales_client_ref on public.sales (client_ref) where client_ref is not null;
create index if not exists idx_stock_warehouse_updated on public.stock (warehouse_id, updated_at desc);
create index if not exists idx_stock_warehouse_product on public.stock (warehouse_id, product_id);
create index if not exists idx_users_email on public.users (email);
create index if not exists idx_users_auth_uid on public.users (auth_uid) where auth_uid is not null;
create index if not exists idx_stock_movements_warehouse_product on public.stock_movements (warehouse_id, product_id, created_at desc);
create index if not exists idx_stock_movements_product on public.stock_movements (product_id, created_at desc);
create index if not exists idx_products_active on public.products (active) where active = true;
create index if not exists idx_categories_sort on public.categories (sort_order);
create index if not exists idx_subcategories_category on public.subcategories (category_id, sort_order);

-- =====================================================
-- Trigger: mantener stock.updated_at automáticamente
-- =====================================================

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_stock_touch on public.stock;
create trigger trg_stock_touch before update on public.stock
for each row execute function public.touch_updated_at();

-- =====================================================
-- RPC: adjust_stock — operación atómica (resuelve race condition)
-- =====================================================
-- Resta delta al stock del (warehouseId, productId). Si no existe, lo crea.
-- Registra movimiento de auditoría en la misma transacción.
-- Devuelve el nuevo stock.

create or replace function public.adjust_stock(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_delta numeric,
  p_reason text default 'AJUSTE_MANUAL',
  p_note text default null,
  p_user_id uuid default null,
  p_user_name text default null
)
returns numeric as $$
declare
  v_id text := p_warehouse_id::text || '_' || p_product_id::text;
  v_new_qty numeric;
begin
  -- Upsert atómico
  insert into public.stock (id, warehouse_id, product_id, quantity, min_stock, updated_at)
  values (v_id, p_warehouse_id, p_product_id, greatest(0, p_delta), 0, now())
  on conflict (id) do update
    set quantity = greatest(0, public.stock.quantity + p_delta),
        updated_at = now()
  returning quantity into v_new_qty;

  -- Auditoría
  insert into public.stock_movements (warehouse_id, product_id, delta, reason, note, user_id, user_name, created_at)
  values (p_warehouse_id, p_product_id, p_delta, p_reason, p_note, p_user_id, p_user_name, now());

  return v_new_qty;
end;
$$ language plpgsql security definer;

-- =====================================================
-- RPC: create_admin_user — crea usuario + perfil en una transacción
-- =====================================================
-- Para que el admin pueda crear usuarios sin exponer service_role en el cliente.
-- El caller (admin) autenticado pasa los datos; la RPC crea el auth.user y el perfil.

create or replace function public.create_admin_user(
  p_email text,
  p_password text,
  p_username text,
  p_display_name text,
  p_role text,
  p_warehouse_ids uuid[] default '{}'
)
returns uuid as $$
declare
  v_auth_uid uuid;
  v_user_id uuid;
begin
  -- Crear auth user
  insert into auth.users (instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
  values ('00000000-0000-0000-0000-000000000000', lower(p_email), crypt(p_password, gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated')
  returning id into v_auth_uid;

  -- Crear perfil público
  insert into public.users (auth_uid, username, display_name, email, role, active, warehouse_ids)
  values (v_auth_uid, lower(p_username), p_display_name, lower(p_email), p_role, true, p_warehouse_ids)
  returning id into v_user_id;

  return v_user_id;
end;
$$ language plpgsql security definer;

-- =====================================================
-- RPC: update_sale_status — cambio de estado atómico con stock
-- =====================================================
-- Descuenta o restaura stock de los items en una transacción.
-- Garantiza consistencia (no más ventas con stock inconsistente).

create or replace function public.update_sale_status(
  p_sale_id text,
  p_new_status text,
  p_reason text default null,
  p_user_id uuid default null,
  p_user_name text default null
)
returns void as $$
declare
  v_sale record;
  v_item jsonb;
begin
  select * from public.sales where id = p_sale_id into v_sale;
  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.status = p_new_status then
    return;
  end if;

  -- COMPLETADA: descontar stock
  if p_new_status = 'COMPLETADA' then
    for v_item in select jsonb_array_elements(items) as item from public.sales where id = p_sale_id loop
      perform public.adjust_stock(
        v_sale.warehouse_id,
        (v_item->>'productId')::uuid,
        -((v_item->>'quantity')::numeric),
        'VENTA',
        'Venta ' || v_sale.code,
        p_user_id,
        p_user_name
      );
    end loop;
    update public.sales set status = 'COMPLETADA', completed_at = now() where id = p_sale_id;

  -- CANCELADA: restaurar si venía de COMPLETADA
  elsif p_new_status = 'CANCELADA' and v_sale.status = 'COMPLETADA' then
    for v_item in select jsonb_array_elements(items) as item from public.sales where id = p_sale_id loop
      perform public.adjust_stock(
        v_sale.warehouse_id,
        (v_item->>'productId')::uuid,
        ((v_item->>'quantity')::numeric),
        'CANCELACION',
        'Cancelación ' || v_sale.code,
        p_user_id,
        p_user_name
      );
    end loop;
    update public.sales set status = 'CANCELADA', cancelled_at = now(), cancel_reason = p_reason where id = p_sale_id;

  elsif p_new_status = 'CANCELADA' then
    update public.sales set status = 'CANCELADA', cancelled_at = now(), cancel_reason = p_reason where id = p_sale_id;

  elsif p_new_status = 'PENDIENTE' then
    -- REABRIR (CANCELADA → PENDIENTE): no toca stock
    update public.sales set status = 'PENDIENTE', cancelled_at = null, cancel_reason = null where id = p_sale_id;
  end if;
end;
$$ language plpgsql security definer;

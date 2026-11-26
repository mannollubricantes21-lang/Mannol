-- =====================================================
-- MANNOL POS · BASE DE DATOS COMPLETA (instalar o actualizar)
-- =====================================================
-- Un solo archivo para todo:
--   · Base NUEVA  → ejecútalo entero.
--   · Base que YA USAS → ejecútalo entero igual: solo añade lo que falte,
--     no borra datos. Se puede repetir las veces que quieras.
--
-- Cómo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
--
-- Este archivo reúne lo que antes estaba repartido en schema.sql,
-- policies.sql y las 15 migraciones (migration-*.sql). El orden importa:
-- 1) tablas · 2) funciones de permisos · 3) cambios por versión ·
-- 4) permisos (RLS) · 5) cambios v5.20 y v5.21.
-- =====================================================


-- ############################################################
-- ## 1 · TABLAS Y FUNCIONES BÁSICAS
-- ############################################################

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
alter table public.rate_config enable row level security;

-- 3. rates (4 filas: USD, MN, EUR, TRANSFERENCIA)
create table if not exists public.rates (
  currency text primary key,
  rate_usd numeric not null default 1,
  source text not null default 'manual' check (source in ('manual','api')),
  updated_at timestamptz not null default now()
);
alter table public.rates enable row level security;

-- 4. warehouses
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  phone text,
  active boolean not null default true,
  pin text,
  -- v5.17: hash del PIN (SHA-256 + sal, se recalcula con un trigger)
  pin_salt text,
  pin_hash text,
  seller_commission_percent numeric not null default 0,
  seller_commission_currency text not null default 'USD' check (seller_commission_currency in ('USD','MN')),
  -- v5.14: quién vende (una persona, o dos: lunes a viernes + fin de semana)
  seller_weekend_split boolean not null default false,
  seller_name text,
  seller_weekend_name text,
  created_at timestamptz not null default now()
);
alter table public.warehouses enable row level security;

-- (settings va después de warehouses: tiene una clave foránea a almacenes)
create table if not exists public.settings (
  id text primary key default 'global',
  pin_code text not null default '2025',
  -- v5.17: hash del PIN. El PIN en claro no se lee desde anon: se valida
  -- en el servidor con verify_warehouse_pin() (ver policies.sql).
  pin_salt text,
  pin_hash text,
  el_toque_enabled boolean not null default true,
  el_toque_markup numeric not null default 5,
  business_name text not null default 'MANNOL',
  last_rate_sync timestamptz,
  -- Regla de fin de semana (migración v2)
  weekend_warehouse_id uuid references public.warehouses(id) on delete set null,
  weekend_redirect_enabled boolean not null default false
);
alter table public.settings enable row level security;


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
alter table public.users enable row level security;

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
alter table public.managers enable row level security;

-- 7. cards (tarjetas bancarias)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number text not null,
  -- v5.17: a anon (sesiones PIN) solo se leen los últimos 4 dígitos
  last4 text generated always as (right(number, 4)) stored,
  bank text check (bank in ('BPA','BANDEC','BANMET') or bank is null),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cards enable row level security;

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
alter table public.categories enable row level security;

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
alter table public.subcategories enable row level security;

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
  thumb_url text,  -- miniatura 200px generada al subir la imagen (listados livianos)
  active boolean not null default true,
  -- Mayorista (Opción B)
  units_per_box int,  -- pomos/botellas por caja. NULL = no mayorista
  wholesale_tiers jsonb default '[]',  -- [{minBoxes, maxBoxes, pricePerUnit, vendorCommission, gestorCommission}]
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;

-- 10b. pin_attempts (auditoría de intentos de PIN de almacén)
create table if not exists public.pin_attempts (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.warehouses(id) on delete set null,
  warehouse_code text,
  ok boolean not null default false,
  device text,
  attempted_at timestamptz not null default now()
);
alter table public.pin_attempts enable row level security;
create index if not exists pin_attempts_warehouse_time on public.pin_attempts (warehouse_id, attempted_at desc);

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
alter table public.stock enable row level security;

-- 12. stock_movements (auditoría)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  delta numeric not null,
  reason text not null check (reason in ('AJUSTE_MANUAL','INVENTARIO','MERMA','DEVOLUCION','VENTA','CANCELACION','REABRIR','TRANSFERENCIA_SALIDA','TRANSFERENCIA_ENTRADA')),
  note text,
  user_id uuid,
  user_name text,
  created_at timestamptz not null default now()
);
alter table public.stock_movements enable row level security;

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
  synced_at timestamptz,
  -- Regla de fin de semana (migración v2): auditoría de ventas reasignadas
  weekend_redirect boolean not null default false,
  original_warehouse_id uuid references public.warehouses(id) on delete set null,
  weekend_warehouse_id uuid references public.warehouses(id) on delete set null
);
alter table public.sales enable row level security;

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
alter table public.commission_payouts enable row level security;

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

-- =====================================================
-- v5.5: transfer_requests — solicitud de mercancía del personal
-- =====================================================
-- El empleado pide producto a otro almacén; el admin aprueba
-- (mueve stock) o rechaza. Máx 1 solicitud PENDIENTE por
-- (origen, destino, producto) — índice único parcial.

create table if not exists public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  code text,
  from_warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  to_warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text,
  quantity numeric not null check (quantity > 0),
  note text,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','APROBADA','RECHAZADA','CANCELADA')),
  requested_by uuid,
  requested_by_name text,
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.transfer_requests enable row level security;

create index if not exists idx_transfer_requests_status on public.transfer_requests (status, created_at desc);
create index if not exists idx_transfer_requests_to_wh on public.transfer_requests (to_warehouse_id, created_at desc);
create unique index if not exists idx_transfer_requests_one_pending
  on public.transfer_requests (from_warehouse_id, to_warehouse_id, product_id)
  where status = 'PENDIENTE';

-- =====================================================
-- v5.5: daily_closures — cierre de caja diario por almacén
-- =====================================================
-- Snapshot del resumen del día. UNIQUE (warehouse_id, closure_date):
-- un cierre por almacén y día (upsert al re-cerrar).

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  warehouse_code text,
  warehouse_name text,
  closure_date date not null,
  sales_count int not null default 0,
  units_sold int not null default 0,
  total_usd numeric not null default 0,
  by_currency jsonb not null default '{}',
  top_products jsonb not null default '[]',
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (warehouse_id, closure_date)
);
alter table public.daily_closures enable row level security;

create index if not exists idx_daily_closures_wh_date on public.daily_closures (warehouse_id, closure_date desc);
create index if not exists idx_daily_closures_date on public.daily_closures (closure_date desc);


-- ############################################################
-- ## 2 · FUNCIONES DE PERMISOS (las usan los pasos siguientes)
-- ############################################################

-- ===== Helper functions =====

-- ¿El usuario está autenticado y activo?
create or replace function public.is_active_user()
returns boolean as $$
  select exists (
    select 1 from public.users
    where auth_uid = auth.uid() and active = true
  );
$$ language sql stable security definer;

-- ¿El usuario es admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where auth_uid = auth.uid() and role = 'admin' and active = true
  );
$$ language sql stable security definer;

-- ¿El usuario es admin o gestor activo?
create or replace function public.is_admin_or_gestor()
returns boolean as $$
  select exists (
    select 1 from public.users
    where auth_uid = auth.uid() and active = true and role in ('admin','gestor')
  );
$$ language sql stable security definer;

-- ¿El usuario actual tiene acceso a un warehouse específico?
-- Admin tiene acceso a todos. Otros roles solo a sus warehouseId/warehouseIds.
-- Usado para filtrar stock/sales/movements por almacén.
create or replace function public.user_can_access_warehouse(p_warehouse_id uuid)
returns boolean as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.users
      where auth_uid = auth.uid()
      and active = true
      and (
        warehouse_id = p_warehouse_id
        or p_warehouse_id = any (warehouse_ids)
      )
    );
$$ language sql stable security definer;



-- ############################################################
-- ## 3 · v2 · comisiones y fin de semana
-- ############################################################

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


-- ############################################################
-- ## 3 · v3 · tarjetas, traspasos y comisiones
-- ############################################################

-- =====================================================
-- MANNOL POS · Migration v3 — Cards saldo, transfers, comisiones mejoradas
-- =====================================================
-- Este script AÑADE tablas y columnas nuevas. Es SEGURO correrlo
-- sobre una instalación existente con datos — no borra nada.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================

-- =====================================================
-- 1. Cards: añadir saldo inicial + moneda
-- =====================================================
-- El "saldo" de una tarjeta se calcula dinámicamente:
--   saldo = initial_balance + movimientos manuales - ventas con transferencia
-- Pero para que sea más simple, también dejamos que el admin ajuste el
-- saldo manualmente con movimientos (depósitos / retiros).

alter table public.cards
  add column if not exists initial_balance numeric not null default 0;

alter table public.cards
  add column if not exists balance_currency text not null default 'USD'
  check (balance_currency in ('USD','MN','EUR'));

-- =====================================================
-- 2. card_movements (auditoría de movimientos de tarjeta)
-- =====================================================
-- Cada vez que el admin hace un depósito, retiro o ajuste,
-- se inserta un registro acá. El saldo actual se calcula
-- sumando todos los movimientos + initial_balance.

create table if not exists public.card_movements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  -- tipo de movimiento: DEPOSIT (entrada), WITHDRAW (salida), ADJUST (ajuste), SALE (venta con transf)
  movement_type text not null check (movement_type in ('DEPOSIT','WITHDRAW','ADJUST','SALE')),
  amount numeric not null,  -- positivo (entrada) o negativo (salida)
  currency text not null default 'USD' check (currency in ('USD','MN','EUR')),
  note text,
  -- referencia opcional a la venta (si el movimiento viene de una venta)
  sale_id text references public.sales(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  user_name text,
  created_at timestamptz not null default now()
);
alter table public.card_movements enable row level security;

create index if not exists idx_card_movements_card_created on public.card_movements (card_id, created_at desc);
create index if not exists idx_card_movements_sale on public.card_movements (sale_id) where sale_id is not null;

-- =====================================================
-- 3. stock_transfers (transferencias de mercancía entre almacenes)
-- =====================================================
-- Cuando un vendedor/admin pide mercancía de otro almacén:
--   - Se crea una transferencia PENDING
--   - El almacén destino confirma que la recibió → status COMPLETED
--     (descuenta stock del origen, suma al destino)
--   - O la rechaza → status REJECTED

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  code text unique,  -- ej: TR-12345 (generado al crear)
  from_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  to_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  quantity int not null check (quantity > 0),
  -- PENDING (esperando aceptación) | COMPLETED (recibida) | REJECTED (rechazada) | CANCELLED (cancelada)
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','REJECTED','CANCELLED')),
  note text,
  requested_by uuid references public.users(id) on delete set null,
  requested_by_name text,
  processed_by uuid references public.users(id) on delete set null,
  processed_by_name text,
  processed_at timestamptz,
  -- Auditoría de stock movements (se insertan 2: salida del origen + entrada al destino)
  origin_movement_id uuid references public.stock_movements(id) on delete set null,
  destination_movement_id uuid references public.stock_movements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_warehouse_id <> to_warehouse_id)
);
alter table public.stock_transfers enable row level security;

create index if not exists idx_stock_transfers_status on public.stock_transfers (status);
create index if not exists idx_stock_transfers_from on public.stock_transfers (from_warehouse_id);
create index if not exists idx_stock_transfers_to on public.stock_transfers (to_warehouse_id);
create index if not exists idx_stock_transfers_product on public.stock_transfers (product_id);

-- Trigger para actualizar updated_at automáticamente
create or replace function public.touch_stock_transfer_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_transfers_touch on public.stock_transfers;
create trigger trg_stock_transfers_touch
  before update on public.stock_transfers
  for each row execute function public.touch_stock_transfer_updated_at();

-- =====================================================
-- 4. sales: marcar día de la semana para comisiones separadas
-- =====================================================
-- Las comisiones del Vedado deben contar sábado/domingo APARTE
-- de lunes-viernes. Para que sea fácil calcular esto, añadimos
-- una columna que guarda el día de la semana (0=domingo, 6=sábado).
-- Se calcula automáticamente al insertar la venta.

alter table public.sales
  add column if not exists day_of_week int
  check (day_of_week between 0 and 6);

-- Función para calcular day_of_week automáticamente
create or replace function public.set_sale_day_of_week()
returns trigger language plpgsql as $$
begin
  if new.day_of_week is null and new.created_at is not null then
    new.day_of_week = extract(dow from new.created_at)::int;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sales_set_day_of_week on public.sales;
create trigger trg_sales_set_day_of_week
  before insert on public.sales
  for each row execute function public.set_sale_day_of_week();

-- Actualizar ventas existentes que no tienen day_of_week
update public.sales
  set day_of_week = extract(dow from created_at)::int
  where day_of_week is null;

-- =====================================================
-- 5. warehouses: default de comisión del vendedor en MN
-- =====================================================
-- Antes el default era USD. Ahora MN por requerimiento del usuario.
-- (no cambiamos el tipo de la columna, solo el default)

alter table public.warehouses
  alter column seller_commission_currency set default 'MN';

-- =====================================================
-- 6. managers: ya tienen commission_currency, no hace falta
--    agregar nada. La UI va a separar MN y USD en la vista
--    de comisiones.
-- =====================================================

-- =====================================================
-- 7. Comentarios informativos
-- =====================================================
comment on table public.card_movements is 'Movimientos de tarjetas bancarias (depósitos, retiros, ajustes, ventas con transferencia). El saldo actual = initial_balance + SUM(movimientos).';
comment on column public.cards.initial_balance is 'Saldo inicial de la tarjeta. El saldo actual = initial_balance + SUM(card_movements.amount).';
comment on column public.cards.balance_currency is 'Moneda en la que se expresa el saldo de la tarjeta.';

comment on table public.stock_transfers is 'Transferencias de mercancía entre almacenes. Una transferencia PENDING espera aceptación del destino. Al confirmarse (COMPLETED), se descuenta stock del origen y se suma al destino automáticamente.';
comment on column public.sales.day_of_week is 'Día de la semana (0=domingo, 6=sábado). Se calcula automáticamente. Usado para separar comisiones del Vedado: sábados/domingos aparte de lunes-viernes.';


-- ############################################################
-- ## 3 · v4 · motivos de traspaso
-- ############################################################

-- =====================================================
-- Migración v4 — Motivos de transferencia en stock_movements
-- =====================================================
-- PROBLEMA: al confirmar una transferencia, el sistema registra
-- movimientos con motivo TRANSFERENCIA_SALIDA / TRANSFERENCIA_ENTRADA,
-- pero el CHECK constraint original de stock_movements.reason solo
-- permitía: AJUSTE_MANUAL, INVENTARIO, MERMA, DEVOLUCION, VENTA,
-- CANCELACION, REABRIR. El INSERT fallaba y la transferencia no se
-- podía confirmar (el stock nunca se movía).
--
-- SOLUCIÓN: ampliar el constraint para aceptar los dos motivos nuevos.
--
-- CÓMO EJECUTARLO: Supabase → SQL Editor → New query → pegar todo
-- este archivo → Run. Es seguro ejecutarlo varias veces (idempotente).
-- =====================================================

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


-- ############################################################
-- ## 3 · v5.1
-- ############################################################

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


-- ############################################################
-- ## 3 · v5.1.3 · stock por PIN
-- ############################################################

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


-- ############################################################
-- ## 3 · v5.1.6 · ventas por PIN
-- ############################################################

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


-- ############################################################
-- ## 3 · v5.1.7 · ventas de fin de semana
-- ############################################################

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


-- ############################################################
-- ## 3 · v5.3 · mejoras
-- ############################################################

-- =====================================================
-- MANNOL POS · Migración v5.3 (mejoras 2026-11)
-- Ejecutar en Supabase → SQL Editor (idempotente, no toca datos).
--
-- Incluye:
--   1. products.thumb_url — miniatura 200px que sube la app junto
--      a la imagen principal (listas más livianas, ahorra cuota).
--   2. RPC deduct_sale_stock — descuento de stock ATÓMICO para la
--      sincronización de ventas offline: solo descuenta si hay
--      stock suficiente, así dos puestos que vendieron lo mismo
--      sin internet no dejan el inventario en negativo.
--   3. Tabla pin_attempts — auditoría de intentos de PIN
--      (detección de accesos no autorizados).
-- =====================================================

-- ===== 1. Miniatura de imagen de producto =====
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS thumb_url text;

-- ===== 2. RPC de descuento atómico de stock =====
-- Recibe los items de una venta ({product_id, quantity}) y descuenta
-- cada uno SOLO si hay stock disponible. Los items sin stock suficiente
-- NO se descuentan y se devuelven en "shortages" para avisar al usuario.
-- Registra el movimiento de auditoría por cada item descontado.
CREATE OR REPLACE FUNCTION public.deduct_sale_stock(
  p_warehouse_id uuid,
  p_items jsonb,
  p_reason text DEFAULT 'VENTA',
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         int;
  v_available   numeric;
  v_shortages   jsonb := '[]'::jsonb;
  v_deducted    int := 0;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'warehouse_null', 'deducted', 0, 'shortages', v_shortages);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(quantity, 0) INTO v_available
    FROM public.stock
    WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;

    IF v_available IS NULL OR v_available < v_qty THEN
      v_shortages := v_shortages || jsonb_build_object(
        'product_id', v_product_id,
        'requested', v_qty,
        'available', COALESCE(v_available, 0)
      );
    ELSE
      UPDATE public.stock
      SET quantity = quantity - v_qty,
          updated_at = now()
      WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;

      INSERT INTO public.stock_movements (warehouse_id, product_id, delta, reason, note, user_id, user_name)
      VALUES (p_warehouse_id, v_product_id, -v_qty, p_reason, p_note, p_user_id, p_user_name);

      v_deducted := v_deducted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (v_shortages = '[]'::jsonb),
    'deducted', v_deducted,
    'shortages', v_shortages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_sale_stock(uuid, jsonb, text, text, uuid, text) TO anon, authenticated;

-- ===== 3. Auditoría de intentos de PIN =====
-- La app registra (best-effort) cada intento fallido de PIN de almacén.
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_code text,
  ok boolean NOT NULL DEFAULT false,
  device text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
alter table public.pin_attempts enable row level security;

ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede registrar un intento (las sesiones PIN son anon)
DROP POLICY IF EXISTS pin_attempts_insert ON public.pin_attempts;
CREATE POLICY pin_attempts_insert ON public.pin_attempts
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Solo admins leen el historial
DROP POLICY IF EXISTS pin_attempts_read_admin ON public.pin_attempts;
CREATE POLICY pin_attempts_read_admin ON public.pin_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_uid = auth.uid() AND u.role = 'admin' AND u.active
    )
  );

CREATE INDEX IF NOT EXISTS pin_attempts_warehouse_time
  ON public.pin_attempts (warehouse_id, attempted_at DESC);

-- ===== Verificación (opcional) =====
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'products' AND column_name = 'thumb_url';
-- SELECT proname FROM pg_proc WHERE proname = 'deduct_sale_stock';
-- SELECT count(*) FROM public.pin_attempts;


-- ############################################################
-- ## 3 · v5.5 · solicitudes de traspaso y cierres
-- ############################################################

-- =====================================================
-- MANNOL POS · Migración v5.5 — Traspasos solicitados + Cierre de caja
-- =====================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query.
-- Idempotente: se puede re-ejecutar sin romper nada.
-- =====================================================

-- =====================================================
-- 1) transfer_requests — solicitud de mercancía del personal
-- =====================================================
-- El empleado del almacén pide producto a otro almacén.
-- El admin la aprueba (mueve stock) o la rechaza desde el
-- panel → Transferencias → "Solicitudes del personal".

create table if not exists public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  code text,  -- TRS-xxxxx (se genera en el cliente)
  from_warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  to_warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text,
  quantity numeric not null check (quantity > 0),
  note text,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','APROBADA','RECHAZADA','CANCELADA')),
  requested_by uuid,          -- users.id (opcional en sesiones PIN)
  requested_by_name text,
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.transfer_requests enable row level security;

ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

-- El personal autenticado crea solicitudes
DROP POLICY IF EXISTS transfer_requests_insert ON public.transfer_requests;
CREATE POLICY transfer_requests_insert ON public.transfer_requests
  FOR INSERT TO authenticated WITH CHECK (true);

-- Lectura para autenticados (el admin ve todas; cada almacén filtra por destino en el cliente)
DROP POLICY IF EXISTS transfer_requests_read ON public.transfer_requests;
CREATE POLICY transfer_requests_read ON public.transfer_requests
  FOR SELECT TO authenticated USING (true);

-- Resolución (aprobar/rechazar) solo para admins
DROP POLICY IF EXISTS transfer_requests_update_admin ON public.transfer_requests;
CREATE POLICY transfer_requests_update_admin ON public.transfer_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_uid = auth.uid() AND u.role = 'admin' AND u.active
    )
  );

CREATE INDEX IF NOT EXISTS idx_transfer_requests_status
  ON public.transfer_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_to_wh
  ON public.transfer_requests (to_warehouse_id, created_at DESC);

-- Higiene: máximo UNA solicitud PENDIENTE por (origen, destino, producto)
DROP INDEX IF EXISTS idx_transfer_requests_one_pending;
CREATE UNIQUE INDEX idx_transfer_requests_one_pending
  ON public.transfer_requests (from_warehouse_id, to_warehouse_id, product_id)
  WHERE status = 'PENDIENTE';

-- =====================================================
-- 2) daily_closures — cierre de caja diario por almacén
-- =====================================================
-- Snapshot inmutable del resumen del día, guardado al pulsar
-- "Cerrar caja" en el interior del almacén.
-- UNIQUE (warehouse_id, closure_date): un cierre por almacén y día
-- (el cliente hace upsert si se vuelve a cerrar el mismo día).

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  warehouse_code text,
  warehouse_name text,
  closure_date date not null,
  sales_count int not null default 0,
  units_sold int not null default 0,
  total_usd numeric not null default 0,
  by_currency jsonb not null default '{}',   -- {USD:{count,amount},MN:{...},EUR:{...},TRANSFERENCIA:{...}}
  top_products jsonb not null default '[]',  -- [{name, qty, total}] (máx 5)
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (warehouse_id, closure_date)
);
alter table public.daily_closures enable row level security;

ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_closures_insert ON public.daily_closures;
CREATE POLICY daily_closures_insert ON public.daily_closures
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS daily_closures_update ON public.daily_closures;
CREATE POLICY daily_closures_update ON public.daily_closures
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS daily_closures_read ON public.daily_closures;
CREATE POLICY daily_closures_read ON public.daily_closures
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_daily_closures_wh_date
  ON public.daily_closures (warehouse_id, closure_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_closures_date
  ON public.daily_closures (closure_date DESC);

-- ===== Verificación (opcional) =====
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN ('transfer_requests','daily_closures');


-- ############################################################
-- ## 3 · v5.12 · marcas
-- ############################################################

-- =====================================================
-- MANNOL POS · Migración v5.12 — Marcas + tipos de producto
-- =====================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar → Run.
-- Idempotente: se puede re-ejecutar sin romper nada ni duplicar.
--
-- Qué hace:
--   1) Crea la tabla `brands` (marcas que el admin gestiona en Admin → Marcas).
--      Todos la pueden leer (también los accesos por PIN); solo el admin escribe.
--   2) Añade las marcas MANNOL y Royal + las que ya usan tus productos.
--   3) Crea los tipos de producto que falten como categorías:
--      Refrigerante, Líquido de freno, Filtros, Lubricantes, Aditivos.
--      (No toca ni borra las categorías que ya tengas.)
--   4) Activa los cambios en vivo (realtime) de la tabla de marcas.
-- =====================================================

-- -----------------------------------------------------
-- 1) Tabla de marcas
-- -----------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  color text not null default 'slate',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.brands enable row level security;

create unique index if not exists brands_slug_key on public.brands (slug);
create index if not exists idx_brands_sort on public.brands (sort_order, name);

alter table public.brands enable row level security;

drop policy if exists "brands_read_anyone" on public.brands;
create policy "brands_read_anyone" on public.brands
  for select to anon, authenticated using (true);

drop policy if exists "brands_write_admin" on public.brands;
create policy "brands_write_admin" on public.brands
  for insert to authenticated with check (public.is_admin());

drop policy if exists "brands_update_admin" on public.brands;
create policy "brands_update_admin" on public.brands
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "brands_delete_admin" on public.brands;
create policy "brands_delete_admin" on public.brands
  for delete to authenticated using (public.is_admin());

grant select on public.brands to anon, authenticated;
grant insert, update, delete on public.brands to authenticated;

-- -----------------------------------------------------
-- 2) Marcas iniciales
-- -----------------------------------------------------
-- El slug es el nombre en minúsculas, sin tildes y con guiones (igual que la app).
insert into public.brands (name, slug, color, sort_order)
values ('MANNOL', 'mannol', 'amber', 1),
       ('Royal',  'royal',  'indigo', 2)
on conflict (slug) do nothing;

insert into public.brands (name, slug, sort_order)
select b.name, b.slug, 100
from (
  select distinct on (x.slug) x.name, x.slug
  from (
    select trim(p.brand) as name,
           trim(both '-' from regexp_replace(
             translate(lower(trim(p.brand)), 'áéíóúüñàèìòùâêîôûç', 'aeiouunaeiouaeiouc'),
             '[^a-z0-9]+', '-', 'g')) as slug,
           p.created_at
    from public.products p
    where coalesce(trim(p.brand), '') <> ''
  ) x
  where x.slug <> ''
  order by x.slug, x.created_at
) b
on conflict (slug) do nothing;

-- -----------------------------------------------------
-- 3) Tipos de producto (categorías principales) que falten
-- -----------------------------------------------------
-- Se compara sin mayúsculas, sin tildes y sin la "s" final de cada palabra:
-- si ya tienes "Filtro" o "Líquidos de frenos", no se crea otra igual.
insert into public.categories (name, slug, color, icon, parent_id, sort_order, active)
select v.name, v.slug, v.color, v.icon, null, v.sort_order, true
from (values
  ('Refrigerante',     'refrigerante',     'cyan',    '❄️', 1),
  ('Líquido de freno', 'liquido-de-freno', 'rose',    '🛑', 2),
  ('Filtros',          'filtros',          'blue',    '🔧', 3),
  ('Lubricantes',      'lubricantes',      'emerald', '🛢️', 4),
  ('Aditivos',         'aditivos',         'violet',  '🧪', 5)
) as v(name, slug, color, icon, sort_order)
where not exists (
  select 1
  from public.categories c
  where c.parent_id is null
    and (
      c.slug = v.slug
      or regexp_replace(translate(lower(trim(c.name)), 'áéíóúü', 'aeiouu'), '([a-z]{3,})s\M', '\1', 'g')
       = regexp_replace(translate(lower(v.name), 'áéíóúü', 'aeiouu'), '([a-z]{3,})s\M', '\1', 'g')
    )
);

-- -----------------------------------------------------
-- 4) Realtime: cambios de marcas en vivo en todos los dispositivos
-- -----------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.brands';
  exception when others then
    null; -- ya estaba en la publicación: ignorar
  end;
end $$;

-- Que la API vea la tabla nueva sin esperar
notify pgrst, 'reload schema';

-- -----------------------------------------------------
-- Verificación
-- -----------------------------------------------------
select 'MIGRACIÓN v5.12 COMPLETADA' as resultado,
       (select count(*) from public.brands) as marcas,
       (select string_agg(name, ', ' order by sort_order) from public.categories where parent_id is null) as tipos;


-- ############################################################
-- ## 3 · v5.13 · ventas sin conexión
-- ############################################################

-- =====================================================
-- MANNOL POS · Migración v5.13 — Ventas sin conexión
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- Idempotente (se puede repetir sin problema) y NO borra datos.
--
-- Incluye:
--   1. RPC register_sale(p_sale) — sube UNA venta de la cola del equipo:
--        · guarda la venta y descuenta el stock en UNA sola transacción
--          (o todo o nada: nunca queda la venta sin descontar el stock);
--        · IDEMPOTENTE por client_ref: si la respuesta se pierde y la app
--          reintenta, NO se duplica la venta ni se descuenta dos veces;
--        · el stock se descuenta SIEMPRE del almacén de la venta, aunque
--          otros almacenes estén subiendo sus ventas a la vez;
--        · exige un almacén que exista: nunca guarda ventas "sin almacén";
--        · descuento atómico (UPDATE … WHERE quantity >= cantidad): dos
--          almacenes/puestos que suben a la vez no dejan stock negativo.
--          Si no alcanza, NO descuenta ese producto y lo devuelve en
--          "shortages" (la app avisa para revisar el inventario).
--   2. Corrección de update_sale_status: las ventas guardan sus productos
--      con la clave "product_id", pero la función leía "productId" y al
--      CANCELAR una venta completada fallaba (no devolvía el stock).
--      Ahora lee ambas claves y omite líneas sin producto.
--
-- Requisitos: schema.sql + policies.sql (cualquier versión 5.x).
-- =====================================================


-- ===== 1. register_sale =====
CREATE OR REPLACE FUNCTION public.register_sale(p_sale jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id          text;
  v_client_ref  text;
  v_existing    text;
  v_wh_id       uuid;
  v_wh_code     text;
  v_wh_name     text;
  v_status      text;
  v_code        text;
  v_user_id     uuid;
  v_user_name   text;
  v_sale        jsonb;
  v_cols        text;
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         numeric;
  v_left        numeric;
  v_available   numeric;
  v_shortages   jsonb := '[]'::jsonb;
  v_deducted    int := 0;
  v_uuid_re     constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'MANNOL_SALE_INVALID: venta vacía';
  END IF;

  v_id := NULLIF(btrim(p_sale->>'id'), '');
  v_client_ref := NULLIF(btrim(p_sale->>'client_ref'), '');
  IF v_id IS NULL OR v_client_ref IS NULL THEN
    RAISE EXCEPTION 'MANNOL_SALE_INVALID: falta id o client_ref';
  END IF;

  -- Reintentos simultáneos de la MISMA venta (dos pestañas, respuesta
  -- perdida…) se ejecutan uno detrás de otro.
  PERFORM pg_advisory_xact_lock(hashtext('mannol_register_sale'), hashtext(v_client_ref));

  -- ¿Ya está subida? → no tocar nada (ni venta ni stock)
  SELECT id INTO v_existing FROM public.sales WHERE client_ref = v_client_ref LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_existing,
                              'deducted', 0, 'shortages', '[]'::jsonb);
  END IF;

  -- Almacén: obligatorio y existente (sin almacén no se guarda: así una
  -- venta nunca queda mezclada/sin dueño).
  IF COALESCE(p_sale->>'warehouse_id', '') !~ v_uuid_re THEN
    RAISE EXCEPTION 'MANNOL_WAREHOUSE_NOT_FOUND: la venta % no tiene un almacén válido', v_id;
  END IF;
  SELECT w.id, w.code, w.name INTO v_wh_id, v_wh_code, v_wh_name
    FROM public.warehouses w WHERE w.id = (p_sale->>'warehouse_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANNOL_WAREHOUSE_NOT_FOUND: el almacén de la venta % ya no existe', v_id;
  END IF;

  -- Mismo id ya guardado:
  --   · sin client_ref → la subió una versión antigua de la app: es la MISMA
  --     venta → duplicado (no se guarda ni se descuenta otra vez);
  --   · con otro client_ref → otra venta con id repetido (casi imposible):
  --     id nuevo, sin perderla.
  SELECT client_ref INTO v_existing FROM public.sales WHERE id = v_id;
  IF FOUND THEN
    IF v_existing IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_id,
                                'deducted', 0, 'shortages', '[]'::jsonb);
    END IF;
    v_id := v_id || '-' || substr(md5(v_client_ref), 1, 6);
  END IF;

  v_sale := p_sale || jsonb_build_object(
    'id', v_id,
    'warehouse_id', v_wh_id,
    'warehouse_code', COALESCE(NULLIF(p_sale->>'warehouse_code', ''), v_wh_code),
    'warehouse_name', COALESCE(NULLIF(p_sale->>'warehouse_name', ''), v_wh_name),
    'synced_at', now()
  );

  -- Columnas uuid con valores que no son uuid (ej. "pin-1789…" de una
  -- sesión PIN): se omiten en vez de fallar (igual que hace la app).
  SELECT v_sale - COALESCE(array_agg(a.attname::text), ARRAY[]::text[])
    INTO v_sale
    FROM pg_attribute a
   WHERE a.attrelid = 'public.sales'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.atttypid = 'uuid'::regtype
     AND v_sale ? a.attname
     AND jsonb_typeof(v_sale -> a.attname) <> 'null'
     AND (v_sale ->> a.attname) !~ v_uuid_re;

  -- Columnas recibidas que existen en la tabla (las que faltan o vienen
  -- null toman el valor por defecto de la tabla).
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.sales'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attgenerated = ''
     AND v_sale ? a.attname
     AND jsonb_typeof(v_sale -> a.attname) <> 'null';

  BEGIN
    EXECUTE format(
      'INSERT INTO public.sales (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.sales, $1)',
      v_cols
    ) USING v_sale;
  EXCEPTION WHEN unique_violation THEN
    -- Otra subida de la misma venta ganó la carrera (método anterior)
    SELECT id INTO v_existing FROM public.sales WHERE client_ref = v_client_ref LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_existing,
                                'deducted', 0, 'shortages', '[]'::jsonb);
    END IF;
    RAISE;
  END;

  -- Stock: solo ventas COMPLETADAS, solo del almacén de la venta
  v_status := COALESCE(NULLIF(v_sale->>'status', ''), 'PENDIENTE');
  IF v_status = 'COMPLETADA' THEN
    v_code := COALESCE(NULLIF(v_sale->>'code', ''), v_id);
    v_user_id := CASE WHEN COALESCE(v_sale->>'user_id', '') ~ v_uuid_re THEN (v_sale->>'user_id')::uuid END;
    v_user_name := NULLIF(v_sale->>'user_name', '');

    FOR v_item IN
      SELECT value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_sale->'items') = 'array' THEN v_sale->'items' ELSE '[]'::jsonb END
      )
    LOOP
      v_product_id := CASE
        WHEN COALESCE(v_item->>'product_id', v_item->>'productId', '') ~ v_uuid_re
        THEN COALESCE(v_item->>'product_id', v_item->>'productId')::uuid
      END;
      v_qty := CASE
        WHEN COALESCE(v_item->>'quantity', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        THEN (v_item->>'quantity')::numeric
        ELSE 0
      END;
      IF v_product_id IS NULL OR v_qty <= 0 THEN
        CONTINUE;
      END IF;

      UPDATE public.stock
         SET quantity = quantity - v_qty,
             updated_at = now()
       WHERE warehouse_id = v_wh_id
         AND product_id = v_product_id
         AND quantity >= v_qty
      RETURNING quantity INTO v_left;

      IF FOUND THEN
        INSERT INTO public.stock_movements (warehouse_id, product_id, delta, reason, note, user_id, user_name)
        VALUES (v_wh_id, v_product_id, -v_qty, 'VENTA', 'Venta ' || v_code, v_user_id, v_user_name);
        v_deducted := v_deducted + 1;
      ELSE
        SELECT quantity INTO v_available
          FROM public.stock
         WHERE warehouse_id = v_wh_id AND product_id = v_product_id;
        v_shortages := v_shortages || jsonb_build_object(
          'product_id', v_product_id,
          'requested', v_qty,
          'available', COALESCE(v_available, 0)
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'sale_id', v_id,
    'deducted', v_deducted,
    'shortages', v_shortages
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_sale(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_sale(jsonb) TO anon, authenticated;


-- ===== 2. update_sale_status: leer "product_id" (y "productId") =====
CREATE OR REPLACE FUNCTION public.update_sale_status(
  p_sale_id text,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_name text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_sale record;
  v_item jsonb;
  v_pid  text;
  v_qty  numeric;
BEGIN
  SELECT * FROM public.sales WHERE id = p_sale_id INTO v_sale;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.status = p_new_status THEN
    RETURN;
  END IF;

  -- COMPLETADA: descontar stock
  IF p_new_status = 'COMPLETADA' THEN
    IF v_sale.warehouse_id IS NOT NULL THEN
      FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb)) LOOP
        v_pid := COALESCE(v_item->>'product_id', v_item->>'productId');
        v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
        CONTINUE WHEN v_pid IS NULL OR v_pid = '' OR v_qty <= 0;
        PERFORM public.adjust_stock(v_sale.warehouse_id, v_pid::uuid, -v_qty,
                                    'VENTA', 'Venta ' || COALESCE(v_sale.code, v_sale.id), p_user_id, p_user_name);
      END LOOP;
    END IF;
    UPDATE public.sales SET status = 'COMPLETADA', completed_at = now() WHERE id = p_sale_id;

  -- CANCELADA: devolver el stock si venía de COMPLETADA
  ELSIF p_new_status = 'CANCELADA' AND v_sale.status = 'COMPLETADA' THEN
    IF v_sale.warehouse_id IS NOT NULL THEN
      FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb)) LOOP
        v_pid := COALESCE(v_item->>'product_id', v_item->>'productId');
        v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
        CONTINUE WHEN v_pid IS NULL OR v_pid = '' OR v_qty <= 0;
        PERFORM public.adjust_stock(v_sale.warehouse_id, v_pid::uuid, v_qty,
                                    'CANCELACION', 'Cancelación ' || COALESCE(v_sale.code, v_sale.id), p_user_id, p_user_name);
      END LOOP;
    END IF;
    UPDATE public.sales SET status = 'CANCELADA', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_sale_id;

  ELSIF p_new_status = 'CANCELADA' THEN
    UPDATE public.sales SET status = 'CANCELADA', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_sale_id;

  ELSIF p_new_status = 'PENDIENTE' THEN
    -- REABRIR (CANCELADA → PENDIENTE): no toca stock
    UPDATE public.sales SET status = 'PENDIENTE', cancelled_at = NULL, cancel_reason = NULL WHERE id = p_sale_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;


-- ===== Verificación (opcional) =====
-- SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('register_sale', 'update_sale_status');
-- SELECT public.register_sale('{}'::jsonb);  -- debe responder: MANNOL_SALE_INVALID


-- ############################################################
-- ## 3 · v5.14 · vendedores
-- ############################################################

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


-- ############################################################
-- ## 3 · v5.17 · seguridad
-- ############################################################

-- =====================================================
-- MANNOL POS · migration-v5.17-seguridad.sql
-- =====================================================
-- Cierra las fugas de seguridad detectadas en la revisión de v5.15.0:
--
--   1. El PIN de almacén (warehouses.pin) y el PIN global (settings.pin_code)
--      se leían con la clave pública. Ahora se validan en el SERVIDOR con la
--      función verify_warehouse_pin() y la app solo recibe un HASH (SHA-256
--      con sal) para revalidar sin conexión. El PIN en claro nunca sale de
--      la base de datos: anon ya no puede leer esas columnas.
--   2. El número completo de las tarjetas (cards.number) era público y cada
--      venta guardaba card_number completo. Ahora anon solo lee los últimos
--      4 dígitos (columna last4) y las ventas antiguas se recortan a 4.
--   3. deduct_sale_stock() estaba concedida a anon (cualquiera podía restar
--      stock). Se revoca: con register_sale() (migration-v5.13) ya no hace
--      falta. Solo se revoca si register_sale existe.
--   4. Límite de intentos en el SERVIDOR: 5 PIN incorrectos por almacén en
--      10 minutos → la RPC rechaza (antes el límite vivía en localStorage).
--
-- RE-EJECUTABLE: se puede correr varias veces sin romper nada.
-- Requiere: schema.sql aplicado. Compatible con migration-v5.13 aplicada.
-- =====================================================

create extension if not exists pgcrypto;

-- =====================================================
-- 1. Columnas de hash de PIN + recorte de tarjetas
-- =====================================================

alter table public.warehouses
  add column if not exists pin_salt text;
alter table public.warehouses
  add column if not exists pin_hash text;

alter table public.settings
  add column if not exists pin_salt text;
alter table public.settings
  add column if not exists pin_hash text;

-- Últimos 4 dígitos, calculados solos a partir de number.
alter table public.cards
  add column if not exists last4 text
  generated always as (right(number, 4)) stored;

-- Recortar los números de tarjeta guardados en ventas antiguas (quedan solo
-- los últimos 4). Las ventas nuevas ya los guardan recortados desde la app.
update public.sales
  set card_number = right(card_number, 4)
  where card_number is not null and length(card_number) > 4;

-- =====================================================
-- 2. Recalcular el hash cuando el PIN cambia (trigger)
-- =====================================================

create or replace function public.recompute_pin_hash()
returns trigger as $$
declare
  v_pin text;
  v_salt text;
begin
  if tg_table_name = 'warehouses' then
    v_pin := nullif(trim(new.pin), '');
  else
    v_pin := nullif(trim(new.pin_code), '');
  end if;
  v_salt := nullif(new.pin_salt, '');

  if v_pin is null then
    -- Sin PIN → sin hash (el acceso queda "libre", igual que antes)
    new.pin_salt := null;
    new.pin_hash := null;
  else
    if v_salt is null then
      v_salt := encode(gen_random_bytes(8), 'hex');
    end if;
    new.pin_salt := v_salt;
    new.pin_hash := encode(digest(v_pin || v_salt, 'sha256'), 'hex');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_warehouses_pin_hash on public.warehouses;
create trigger trg_warehouses_pin_hash
  before insert or update of pin, pin_salt on public.warehouses
  for each row execute function public.recompute_pin_hash();

drop trigger if exists trg_settings_pin_hash on public.settings;
create trigger trg_settings_pin_hash
  before insert or update of pin_code, pin_salt on public.settings
  for each row execute function public.recompute_pin_hash();

-- Backfill: generar sal+hash para los PIN ya existentes.
update public.warehouses
  set pin_salt = encode(gen_random_bytes(8), 'hex')
  where nullif(trim(coalesce(pin, '')), '') is not null and pin_salt is null;
update public.warehouses
  set pin_hash = encode(digest(trim(pin) || pin_salt, 'sha256'), 'hex')
  where nullif(trim(coalesce(pin, '')), '') is not null and pin_hash is null;

update public.settings
  set pin_salt = encode(gen_random_bytes(8), 'hex')
  where id = 'global'
    and nullif(trim(coalesce(pin_code, '')), '') is not null and pin_salt is null;
update public.settings
  set pin_hash = encode(digest(trim(pin_code) || pin_salt, 'sha256'), 'hex')
  where id = 'global'
    and nullif(trim(coalesce(pin_code, '')), '') is not null and pin_hash is null;

-- =====================================================
-- 3. RPC segura: validar el PIN del almacén en el SERVIDOR
-- =====================================================
-- Regla (igual que la app): vale el PIN propio del almacén; si no tiene,
-- vale el PIN global de settings. Devuelve SOLO:
--   · ok / reason
--   · los datos públicos del almacén (sin pin, pin_salt ni pin_hash)
--   · pinSalt + pinHash del PIN que sirvió, para revalidar SIN conexión
--     (SHA-256 en el navegador). Sin el PIN correcto no se obtiene el hash.
-- Rate limit en servidor: 5 intentos fallidos por almacén en 10 minutos.
create or replace function public.verify_warehouse_pin(p_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  wh public.warehouses%rowtype;
  v_pin text;
  v_source text;
  v_salt text;
  v_hash text;
  v_ok boolean := false;
  v_fails int := 0;
  v_retry_sec int := 0;
begin
  if p_code is null or p_pin is null or btrim(p_pin) = '' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  select * into wh
    from public.warehouses
    where lower(code) = lower(btrim(p_code))
    limit 1;
  if wh.id is null then
    return jsonb_build_object('ok', false, 'reason', 'warehouse_not_found');
  end if;

  -- Rate limit en servidor (el del navegador ya no basta)
  select count(*) into v_fails
    from public.pin_attempts
    where warehouse_id = wh.id
      and ok = false
      and attempted_at > now() - interval '10 minutes';
  if v_fails >= 5 then
    select greatest(600 - extract(epoch from (now() - max(attempted_at)))::int, 1)
      into v_retry_sec
      from public.pin_attempts
      where warehouse_id = wh.id and ok = false
        and attempted_at > now() - interval '10 minutes';
    return jsonb_build_object('ok', false, 'reason', 'rate_limited',
      'retryAfterSec', greatest(v_retry_sec, 1));
  end if;

  v_pin := nullif(btrim(coalesce(wh.pin, '')), '');
  v_source := 'warehouse';
  v_salt := wh.pin_salt;
  v_hash := wh.pin_hash;
  if v_pin is null then
    -- Fallback: PIN global de settings (misma regla que la app)
    select nullif(btrim(coalesce(pin_code, '')), ''), pin_salt, pin_hash
      into v_pin, v_salt, v_hash
      from public.settings where id = 'global';
    v_source := 'global';
  end if;
  if v_pin is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin_configured');
  end if;

  if v_hash is not null and v_salt is not null then
    v_ok := (v_hash = encode(digest(btrim(p_pin) || v_salt, 'sha256'), 'hex'));
  else
    -- Compatibilidad: hash aún no generado (backfill pendiente)
    v_ok := (btrim(p_pin) = v_pin);
  end if;

  -- Auditoría de intentos (la app también registra en modo sin conexión)
  insert into public.pin_attempts (warehouse_id, warehouse_code, ok, device)
    values (wh.id, wh.code, v_ok, null);

  if not v_ok then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pinSource', v_source,
    'pinLength', length(v_pin),
    'pinSalt', v_salt,
    'pinHash', v_hash,
    'warehouse', jsonb_build_object(
      'id', wh.id,
      'name', wh.name,
      'code', wh.code,
      'address', wh.address,
      'phone', wh.phone,
      'active', wh.active,
      'seller_commission_percent', wh.seller_commission_percent,
      'seller_commission_currency', wh.seller_commission_currency,
      'seller_weekend_split', wh.seller_weekend_split,
      'seller_name', wh.seller_name,
      'seller_weekend_name', wh.seller_weekend_name,
      'created_at', wh.created_at
    )
  );
end;
$$;

grant execute on function public.verify_warehouse_pin(text, text) to anon, authenticated;

-- =====================================================
-- 4. Privacidad por columna: anon ya no lee PINs ni números completos
-- =====================================================
-- El rol anon es el de las sesiones por PIN del local (y cualquier persona
-- con la clave pública). Con estos grants, `select *` desde anon da error de
-- permiso en esas tablas → la app usa listas de columnas seguras (js/db.js).
-- Los GRANT piden las columnas extendidas y, si alguna aún no existe (p. ej.
-- vendedores de migration-v5.14 sin ejecutar), caen a la lista base.

-- 4a. warehouses: todo menos pin / pin_salt / pin_hash
revoke select on table public.warehouses from anon;
do $$
begin
  grant select (
    id, name, code, address, phone, active,
    seller_commission_percent, seller_commission_currency,
    seller_weekend_split, seller_name, seller_weekend_name, created_at
  ) on table public.warehouses to anon;
exception
  when undefined_object or undefined_column then
    grant select (
      id, name, code, address, phone, active,
      seller_commission_percent, seller_commission_currency, created_at
    ) on table public.warehouses to anon;
end $$;

-- 4b. settings: todo menos pin_code / pin_salt / pin_hash
revoke select on table public.settings from anon;
do $$
begin
  grant select (
    id, el_toque_enabled, el_toque_markup, business_name, last_rate_sync,
    weekend_warehouse_id, weekend_redirect_enabled
  ) on table public.settings to anon;
exception
  when undefined_object or undefined_column then
    grant select (
      id, el_toque_enabled, el_toque_markup, business_name, last_rate_sync
    ) on table public.settings to anon;
end $$;

-- 4c. cards: todo menos el número completo (anon ve last4)
revoke select on table public.cards from anon;
do $$
begin
  grant select (
    id, name, bank, active, created_at, initial_balance, balance_currency, last4
  ) on table public.cards to anon;
exception
  when undefined_object or undefined_column then
    grant select (id, name, bank, active, created_at, last4)
      on table public.cards to anon;
end $$;

-- =====================================================
-- 5. deduct_sale_stock ya no se ejecuta desde anon
-- =====================================================
-- Con register_sale() (migration-v5.13) la cola nunca usa la ruta antigua.
-- Solo se revoca si esa RPC existe; si no, se conserva por compatibilidad.
do $$
begin
  if to_regprocedure('public.register_sale(jsonb)') is not null then
    revoke execute on function public.deduct_sale_stock(uuid, jsonb, text, text, uuid, text) from anon;
  end if;
end $$;

-- 5b. Las ventas insertadas desde anon deben llevar almacén válido.
drop policy if exists "sales_insert_pin" on public.sales;
create policy "sales_insert_pin" on public.sales
  for insert to anon
  with check (warehouse_id is not null);

-- =====================================================
-- Notas
-- =====================================================
-- · sales_read_pin / stock_read_pin se quedan en using (true): el vendedor
--   del local necesita leer sus ventas/stock sin sesión de usuario (es el
--   modo offline-first de la app). Quitarlo del todo exige sesiones en el
--   servidor (work futuro). El peor dato (número de tarjeta) ya va recortado.
-- · pin_attempts_insert sigue permitiendo que la app audite intentos hechos
--   sin conexión; verify_warehouse_pin audita los del servidor.
-- · Revertir (no recomendado): grant select on warehouses/settings/cards to anon;
--   grant execute on deduct_sale_stock(...) to anon;
-- =====================================================


-- ############################################################
-- ## 4 · PERMISOS (RLS), ALMACENAMIENTO Y FUNCIONES DE SEGURIDAD
-- ############################################################

-- =====================================================
-- MANNOL POS · Políticas RLS (Row Level Security)
-- =====================================================
-- Equivalente a firestore.rules pero en Postgres RLS.
-- Ejecutar DESPUÉS de schema.sql y ANTES de seed.sql.
--
-- IMPORTANTE: Este archivo es la versión consolidada. Incluye todas
-- las funciones de seguridad (filtrado por almacén, cambio de contraseña,
-- desactivación de usuarios) que antes vivían en migration-v2.sql.
-- Si estás instalando por primera vez, SOLO necesitas:
--   1. schema.sql
--   2. policies.sql  ← este archivo
--   3. seed.sql
-- =====================================================

-- ===== Helper functions =====

-- ¿El usuario está autenticado y activo?
create or replace function public.is_active_user()
returns boolean as $$
  select exists (
    select 1 from public.users
    where auth_uid = auth.uid() and active = true
  );
$$ language sql stable security definer;

-- ¿El usuario es admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where auth_uid = auth.uid() and role = 'admin' and active = true
  );
$$ language sql stable security definer;

-- ¿El usuario es admin o gestor activo?
create or replace function public.is_admin_or_gestor()
returns boolean as $$
  select exists (
    select 1 from public.users
    where auth_uid = auth.uid() and active = true and role in ('admin','gestor')
  );
$$ language sql stable security definer;

-- ¿El usuario actual tiene acceso a un warehouse específico?
-- Admin tiene acceso a todos. Otros roles solo a sus warehouseId/warehouseIds.
-- Usado para filtrar stock/sales/movements por almacén.
create or replace function public.user_can_access_warehouse(p_warehouse_id uuid)
returns boolean as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.users
      where auth_uid = auth.uid()
      and active = true
      and (
        warehouse_id = p_warehouse_id
        or p_warehouse_id = any (warehouse_ids)
      )
    );
$$ language sql stable security definer;

-- =====================================================
-- 1. settings — lectura pública, escritura admin
-- =====================================================
alter table public.settings enable row level security;

drop policy if exists "settings_read_anyone" on public.settings;
create policy "settings_read_anyone" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "settings_write_admin" on public.settings;
create policy "settings_write_admin" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_insert_admin" on public.settings;
create policy "settings_insert_admin" on public.settings
  for insert to authenticated with check (public.is_admin());

-- =====================================================
-- 2. rate_config — lectura pública, escritura admin
-- =====================================================
alter table public.rate_config enable row level security;

drop policy if exists "rate_config_read_anyone" on public.rate_config;
create policy "rate_config_read_anyone" on public.rate_config
  for select to anon, authenticated using (true);

drop policy if exists "rate_config_write_admin" on public.rate_config;
create policy "rate_config_write_admin" on public.rate_config
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_config_insert_admin" on public.rate_config;
create policy "rate_config_insert_admin" on public.rate_config
  for insert to authenticated with check (public.is_admin());

-- =====================================================
-- 3. rates — lectura pública, escritura autenticado
-- =====================================================
alter table public.rates enable row level security;

drop policy if exists "rates_read_anyone" on public.rates;
create policy "rates_read_anyone" on public.rates
  for select to anon, authenticated using (true);

drop policy if exists "rates_write_authed" on public.rates;
create policy "rates_write_authed" on public.rates
  for insert to authenticated with check (public.is_active_user());

drop policy if exists "rates_update_authed" on public.rates;
create policy "rates_update_authed" on public.rates
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- =====================================================
-- 4. warehouses — lectura pública, escritura admin
-- =====================================================
alter table public.warehouses enable row level security;

drop policy if exists "warehouses_read_anyone" on public.warehouses;
create policy "warehouses_read_anyone" on public.warehouses
  for select to anon, authenticated using (true);

drop policy if exists "warehouses_write_admin" on public.warehouses;
create policy "warehouses_write_admin" on public.warehouses
  for insert to authenticated with check (public.is_admin());

drop policy if exists "warehouses_update_admin" on public.warehouses;
create policy "warehouses_update_admin" on public.warehouses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "warehouses_delete_admin" on public.warehouses;
create policy "warehouses_delete_admin" on public.warehouses
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 5. users — lectura self/admin, escritura admin
-- =====================================================
alter table public.users enable row level security;

drop policy if exists "users_read_self_or_admin" on public.users;
create policy "users_read_self_or_admin" on public.users
  for select to authenticated using (
    auth_uid = auth.uid() or public.is_admin()
  );

drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for insert to authenticated with check (public.is_admin());

drop policy if exists "users_update_admin" on public.users;
create policy "users_update_admin" on public.users
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users_delete_admin" on public.users;
create policy "users_delete_admin" on public.users
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 6. managers — lectura pública, escritura admin
-- =====================================================
alter table public.managers enable row level security;

drop policy if exists "managers_read_anyone" on public.managers;
create policy "managers_read_anyone" on public.managers
  for select to anon, authenticated using (true);

drop policy if exists "managers_write_admin" on public.managers;
create policy "managers_write_admin" on public.managers
  for insert to authenticated with check (public.is_admin());

drop policy if exists "managers_update_admin" on public.managers;
create policy "managers_update_admin" on public.managers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "managers_delete_admin" on public.managers;
create policy "managers_delete_admin" on public.managers
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 7. cards — lectura pública, escritura admin
-- =====================================================
alter table public.cards enable row level security;

drop policy if exists "cards_read_anyone" on public.cards;
create policy "cards_read_anyone" on public.cards
  for select to anon, authenticated using (true);

drop policy if exists "cards_write_admin" on public.cards;
create policy "cards_write_admin" on public.cards
  for insert to authenticated with check (public.is_admin());

drop policy if exists "cards_update_admin" on public.cards;
create policy "cards_update_admin" on public.cards
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cards_delete_admin" on public.cards;
create policy "cards_delete_admin" on public.cards
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 8. categories — lectura pública, escritura admin
-- =====================================================
alter table public.categories enable row level security;

drop policy if exists "categories_read_anyone" on public.categories;
create policy "categories_read_anyone" on public.categories
  for select to anon, authenticated using (true);

drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin" on public.categories
  for insert to authenticated with check (public.is_admin());

drop policy if exists "categories_update_admin" on public.categories;
create policy "categories_update_admin" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "categories_delete_admin" on public.categories;
create policy "categories_delete_admin" on public.categories
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 9. subcategories — lectura pública, escritura admin
-- =====================================================
alter table public.subcategories enable row level security;

drop policy if exists "subcategories_read_anyone" on public.subcategories;
create policy "subcategories_read_anyone" on public.subcategories
  for select to anon, authenticated using (true);

drop policy if exists "subcategories_write_admin" on public.subcategories;
create policy "subcategories_write_admin" on public.subcategories
  for insert to authenticated with check (public.is_admin());

drop policy if exists "subcategories_update_admin" on public.subcategories;
create policy "subcategories_update_admin" on public.subcategories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "subcategories_delete_admin" on public.subcategories;
create policy "subcategories_delete_admin" on public.subcategories
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 10. products — lectura pública, escritura admin/gestor
-- =====================================================
alter table public.products enable row level security;

drop policy if exists "products_read_anyone" on public.products;
create policy "products_read_anyone" on public.products
  for select to anon, authenticated using (true);

drop policy if exists "products_write_admin_gestor" on public.products;
create policy "products_write_admin_gestor" on public.products
  for insert to authenticated with check (public.is_admin_or_gestor());

drop policy if exists "products_update_admin_gestor" on public.products;
create policy "products_update_admin_gestor" on public.products
  for update to authenticated using (public.is_admin_or_gestor()) with check (public.is_admin_or_gestor());

drop policy if exists "products_delete_admin_gestor" on public.products;
create policy "products_delete_admin_gestor" on public.products
  for delete to authenticated using (public.is_admin_or_gestor());

-- =====================================================
-- 11. stock — filtrado por almacén (admin ve todo, vendedor solo el suyo)
-- =====================================================
-- Las políticas usan user_can_access_warehouse() para que cada usuario
-- solo vea/modifique stock de almacenes a los que tiene acceso.
-- Si solo usas 1 almacén o no necesitas segregar, puedes cambiar
-- a is_active_user() para un comportamiento más permisivo.

alter table public.stock enable row level security;

drop policy if exists "stock_read_active" on public.stock;
create policy "stock_read_active" on public.stock
  for select to authenticated using (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_write_active" on public.stock;
create policy "stock_write_active" on public.stock
  for insert to authenticated with check (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_update_active" on public.stock;
create policy "stock_update_active" on public.stock
  for update to authenticated using (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  ) with check (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_delete_active" on public.stock;
create policy "stock_delete_active" on public.stock
  for delete to authenticated using (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

-- Lectura de stock para sesiones PIN (el acceso por PIN de almacén
-- no crea sesión de Supabase → rol anon). SOLO LECTURA; escribir
-- stock sigue exigiendo admin/gestor autenticado.
drop policy if exists "stock_read_pin" on public.stock;
create policy "stock_read_pin" on public.stock
  for select to anon using (true);

-- =====================================================
-- 12. stock_movements — filtrado por almacén
-- =====================================================

alter table public.stock_movements enable row level security;

drop policy if exists "stock_movements_read_active" on public.stock_movements;
create policy "stock_movements_read_active" on public.stock_movements
  for select to authenticated using (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_movements_create_active" on public.stock_movements;
create policy "stock_movements_create_active" on public.stock_movements
  for insert to authenticated with check (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

-- =====================================================
-- 13. sales — filtrado por almacén
-- =====================================================

alter table public.sales enable row level security;

drop policy if exists "sales_read_active" on public.sales;
create policy "sales_read_active" on public.sales
  for select to authenticated using (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "sales_create_active" on public.sales;
create policy "sales_create_active" on public.sales
  for insert to authenticated with check (
    public.is_admin() or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "sales_update_admin_gestor" on public.sales;
create policy "sales_update_admin_gestor" on public.sales
  for update to authenticated using (public.is_admin_or_gestor()) with check (public.is_admin_or_gestor());

drop policy if exists "sales_delete_admin_gestor" on public.sales;
create policy "sales_delete_admin_gestor" on public.sales
  for delete to authenticated using (public.is_admin_or_gestor());

-- Accesos por PIN (rol anon): registrar ventas desde el local y leerlas.
-- Sin estas políticas la venta queda "pendiente" y nunca se sube (v5.1.6).
drop policy if exists "sales_insert_pin" on public.sales;
create policy "sales_insert_pin" on public.sales
  for insert to anon with check (true);

drop policy if exists "sales_read_pin" on public.sales;
create policy "sales_read_pin" on public.sales
  for select to anon using (true);

-- =====================================================
-- 14. commission_payouts — lectura filtrada, escritura admin
-- =====================================================
alter table public.commission_payouts enable row level security;

drop policy if exists "commission_payouts_read_active" on public.commission_payouts;
create policy "commission_payouts_read_active" on public.commission_payouts
  for select to authenticated using (public.is_active_user());

drop policy if exists "commission_payouts_write_admin" on public.commission_payouts;
create policy "commission_payouts_write_admin" on public.commission_payouts
  for insert to authenticated with check (public.is_admin());

drop policy if exists "commission_payouts_delete_admin" on public.commission_payouts;
create policy "commission_payouts_delete_admin" on public.commission_payouts
  for delete to authenticated using (public.is_admin());

-- =====================================================
-- 15. Índices para performance de RLS
-- =====================================================
create index if not exists idx_sales_created_at on public.sales (created_at desc);
create index if not exists idx_sales_status_created on public.sales (status, created_at desc);
create index if not exists idx_sales_type on public.sales (sale_type);
create index if not exists idx_sales_type_created on public.sales (sale_type, created_at desc);
create index if not exists idx_products_category on public.products (category_id) where category_id is not null;
create index if not exists idx_products_wholesale on public.products (units_per_box) where units_per_box is not null;
create index if not exists idx_users_role on public.users (role) where active = true;
create index if not exists idx_warehouses_active on public.warehouses (active) where active = true;
create index if not exists idx_managers_active on public.managers (active) where active = true;
create index if not exists idx_cards_active on public.cards (active) where active = true;

-- =====================================================
-- 16. Trigger: sincronizar warehouse_name/code al cambiar warehouse_id
-- =====================================================
-- Si el admin cambia warehouse_id en users, los denormalizados
-- warehouse_name y warehouse_code se actualizan automáticamente.

create or replace function public.sync_user_warehouse_denorm()
returns trigger as $$
declare
  v_wh record;
begin
  if new.warehouse_id is not null and new.warehouse_id is distinct from old.warehouse_id then
    select name, code into v_wh from public.warehouses where id = new.warehouse_id;
    new.warehouse_name := v_wh.name;
    new.warehouse_code := v_wh.code;
  elsif new.warehouse_id is null then
    new.warehouse_name := null;
    new.warehouse_code := null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_users_sync_denorm on public.users;
create trigger trg_users_sync_denorm
  before insert or update of warehouse_id on public.users
  for each row execute function public.sync_user_warehouse_denorm();

-- =====================================================
-- 17. RPC segura: change_user_password (admin cambia contraseñas)
-- =====================================================
-- Permite al admin cambiar la contraseña de un usuario sin exponer
-- la service_role key. Valida longitud mínima y autoexclusión.

create or replace function public.change_user_password(
  p_user_id uuid,
  p_new_password text
)
returns void as $$
declare
  v_auth_uid uuid;
begin
  -- Solo admin puede cambiar contraseñas
  if not public.is_admin() then
    raise exception 'Solo el administrador puede cambiar contraseñas';
  end if;

  -- Validar longitud mínima
  if length(p_new_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  -- Obtener auth_uid del usuario
  select auth_uid into v_auth_uid from public.users where id = p_user_id;
  if v_auth_uid is null then
    raise exception 'Usuario no encontrado o sin cuenta de auth';
  end if;

  -- Actualizar la contraseña en auth.users
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = v_auth_uid;
end;
$$ language plpgsql security definer;

grant execute on function public.change_user_password(uuid, text) to authenticated;

-- =====================================================
-- 18. RPC segura: deactivate_user (soft delete)
-- =====================================================
-- En lugar de borrar el perfil y dejar el auth user huérfano,
-- desactiva el perfil y bloquea el auth. Autoexcluye al propio admin.

create or replace function public.deactivate_user(p_user_id uuid)
returns void as $$
declare
  v_auth_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede desactivar usuarios';
  end if;

  -- No permitir desactivarse a sí mismo
  if p_user_id = (
    select id from public.users where auth_uid = auth.uid()
  ) then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  update public.users set active = false where id = p_user_id
  returning auth_uid into v_auth_uid;

  if v_auth_uid is not null then
    -- Banear el auth user para impedir login
    update auth.users
    set banned_until = '2999-01-01'::timestamptz,
        updated_at = now()
    where id = v_auth_uid;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.deactivate_user(uuid) to authenticated;

-- =====================================================
-- Storage buckets
-- =====================================================
-- Crear buckets públicos para imágenes de productos e imágenes genéricas.
-- Si ya existen, no hace nada (on conflict do nothing).

insert into storage.buckets (id, name, public) values ('products', 'products', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('images', 'images', true)
  on conflict (id) do nothing;

-- Políticas de Storage:
--   - Lectura: pública (cualquiera puede ver)
--   - Escritura: cualquier usuario autenticado
--   - Borrado: solo admin (limpieza de huérfanos desde el panel)

drop policy if exists "products_images_read_public" on storage.objects;
create policy "products_images_read_public" on storage.objects
  for select to anon, authenticated using (bucket_id in ('products','images'));

drop policy if exists "products_images_write_authed" on storage.objects;
create policy "products_images_write_authed" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('products','images')
    and (storage.foldername(name))[1] is not null
  );

drop policy if exists "products_images_update_authed" on storage.objects;
create policy "products_images_update_authed" on storage.objects
  for update to authenticated using (
    bucket_id in ('products','images')
  );

-- Solo el admin puede borrar imágenes (evita que un usuario autenticado
-- borre imágenes de otros productos, y permite limpieza de huérfanos desde el panel).
drop policy if exists "products_images_delete_admin" on storage.objects;
create policy "products_images_delete_admin" on storage.objects
  for delete to authenticated using (
    bucket_id in ('products','images')
    and public.is_admin()
  );

-- =====================================================
-- Grant execute en funciones RPC principales
-- =====================================================
grant execute on function public.adjust_stock(uuid, uuid, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.update_sale_status(text, text, text, uuid, text) to authenticated;
grant execute on function public.create_admin_user(text, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.deduct_sale_stock(uuid, jsonb, text, text, uuid, text) to anon, authenticated;

-- =====================================================
-- Auditoría de intentos de PIN (tabla pin_attempts)
-- Cualquiera registra intentos (sesiones PIN = anon); solo admin lee.
-- =====================================================
drop policy if exists "pin_attempts_insert" on public.pin_attempts;
create policy "pin_attempts_insert" on public.pin_attempts
  for insert to anon, authenticated with check (true);

drop policy if exists "pin_attempts_read_admin" on public.pin_attempts;
create policy "pin_attempts_read_admin" on public.pin_attempts
  for select to authenticated using (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_uid = auth.uid() AND u.role = 'admin' AND u.active
    )
  );

-- =====================================================
-- Resumen de funciones helper expuestas
-- =====================================================
-- Las siguientes funciones se crean en schema.sql y se usan aquí:
--   is_active_user()       — usuario autenticado y activo
--   is_admin()              — usuario con rol 'admin'
--   is_admin_or_gestor()    — admin o gestor
--   user_can_access_warehouse(uuid) — filtrado por almacén (NUEVO, antes en migration-v2)
--
-- Las siguientes funciones se crean en este archivo:
--   change_user_password(uuid, text) — admin cambia contraseña
--   deactivate_user(uuid)            — admin desactiva usuario
--   sync_user_warehouse_denorm()     — trigger automático (NUEVO, antes en migration-v2)
-- =====================================================

-- =====================================================
-- 19. Seguridad v5.17 — PIN en el servidor y privacidad por columna
-- =====================================================
-- Igual que supabase/migration-v5.17-seguridad.sql, para instalaciones nuevas.
-- · El PIN (warehouses.pin / settings.pin_code) se valida en el SERVIDOR con
--   verify_warehouse_pin(); anon ya no puede leer esas columnas.
-- · La app recibe solo un hash (SHA-256+sal) para revalidar SIN conexión.
-- · Las tarjetas exponen a anon solo los últimos 4 dígitos (last4).
-- · Límite en servidor: 5 intentos fallidos por almacén en 10 minutos.

create extension if not exists pgcrypto;

-- Trigger: recalcular pin_salt/pin_hash cuando cambia el PIN.
create or replace function public.recompute_pin_hash()
returns trigger as $$
declare
  v_pin text;
  v_salt text;
begin
  if tg_table_name = 'warehouses' then
    v_pin := nullif(trim(new.pin), '');
  else
    v_pin := nullif(trim(new.pin_code), '');
  end if;
  v_salt := nullif(new.pin_salt, '');
  if v_pin is null then
    new.pin_salt := null;
    new.pin_hash := null;
  else
    if v_salt is null then
      v_salt := encode(gen_random_bytes(8), 'hex');
    end if;
    new.pin_salt := v_salt;
    new.pin_hash := encode(digest(v_pin || v_salt, 'sha256'), 'hex');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_warehouses_pin_hash on public.warehouses;
create trigger trg_warehouses_pin_hash
  before insert or update of pin, pin_salt on public.warehouses
  for each row execute function public.recompute_pin_hash();

drop trigger if exists trg_settings_pin_hash on public.settings;
create trigger trg_settings_pin_hash
  before insert or update of pin_code, pin_salt on public.settings
  for each row execute function public.recompute_pin_hash();

-- RPC segura: validar el PIN del almacén (con fallback al PIN global).
create or replace function public.verify_warehouse_pin(p_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  wh public.warehouses%rowtype;
  v_pin text;
  v_source text;
  v_salt text;
  v_hash text;
  v_ok boolean := false;
  v_fails int := 0;
  v_retry_sec int := 0;
begin
  if p_code is null or p_pin is null or btrim(p_pin) = '' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  select * into wh
    from public.warehouses
    where lower(code) = lower(btrim(p_code))
    limit 1;
  if wh.id is null then
    return jsonb_build_object('ok', false, 'reason', 'warehouse_not_found');
  end if;

  -- Rate limit en servidor (el del navegador ya no basta)
  select count(*) into v_fails
    from public.pin_attempts
    where warehouse_id = wh.id
      and ok = false
      and attempted_at > now() - interval '10 minutes';
  if v_fails >= 5 then
    select greatest(600 - extract(epoch from (now() - max(attempted_at)))::int, 1)
      into v_retry_sec
      from public.pin_attempts
      where warehouse_id = wh.id and ok = false
        and attempted_at > now() - interval '10 minutes';
    return jsonb_build_object('ok', false, 'reason', 'rate_limited',
      'retryAfterSec', greatest(v_retry_sec, 1));
  end if;

  v_pin := nullif(btrim(coalesce(wh.pin, '')), '');
  v_source := 'warehouse';
  v_salt := wh.pin_salt;
  v_hash := wh.pin_hash;
  if v_pin is null then
    select nullif(btrim(coalesce(pin_code, '')), ''), pin_salt, pin_hash
      into v_pin, v_salt, v_hash
      from public.settings where id = 'global';
    v_source := 'global';
  end if;
  if v_pin is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin_configured');
  end if;

  if v_hash is not null and v_salt is not null then
    v_ok := (v_hash = encode(digest(btrim(p_pin) || v_salt, 'sha256'), 'hex'));
  else
    v_ok := (btrim(p_pin) = v_pin);
  end if;

  insert into public.pin_attempts (warehouse_id, warehouse_code, ok, device)
    values (wh.id, wh.code, v_ok, null);

  if not v_ok then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pinSource', v_source,
    'pinLength', length(v_pin),
    'pinSalt', v_salt,
    'pinHash', v_hash,
    'warehouse', jsonb_build_object(
      'id', wh.id,
      'name', wh.name,
      'code', wh.code,
      'address', wh.address,
      'phone', wh.phone,
      'active', wh.active,
      'seller_commission_percent', wh.seller_commission_percent,
      'seller_commission_currency', wh.seller_commission_currency,
      'seller_weekend_split', wh.seller_weekend_split,
      'seller_name', wh.seller_name,
      'seller_weekend_name', wh.seller_weekend_name,
      'created_at', wh.created_at
    )
  );
end;
$$;

grant execute on function public.verify_warehouse_pin(text, text) to anon, authenticated;

-- Privacidad por columna: anon (sesiones PIN + clave pública) ya no puede
-- leer los PIN ni el número completo de las tarjetas. La app usa listas de
-- columnas seguras en js/db.js (listWarehouses/getSettings/listCards…).
-- Si alguna columna extendida aún no existe (migración v5.14 pendiente),
-- el grant cae a la lista base.
revoke select on table public.warehouses from anon;
do $$
begin
  grant select (
    id, name, code, address, phone, active,
    seller_commission_percent, seller_commission_currency,
    seller_weekend_split, seller_name, seller_weekend_name, created_at
  ) on table public.warehouses to anon;
exception
  when undefined_object or undefined_column then
    grant select (
      id, name, code, address, phone, active,
      seller_commission_percent, seller_commission_currency, created_at
    ) on table public.warehouses to anon;
end $$;

revoke select on table public.settings from anon;
do $$
begin
  grant select (
    id, el_toque_enabled, el_toque_markup, business_name, last_rate_sync,
    weekend_warehouse_id, weekend_redirect_enabled
  ) on table public.settings to anon;
exception
  when undefined_object or undefined_column then
    grant select (
      id, el_toque_enabled, el_toque_markup, business_name, last_rate_sync
    ) on table public.settings to anon;
end $$;

revoke select on table public.cards from anon;
do $$
begin
  grant select (
    id, name, bank, active, created_at, initial_balance, balance_currency, last4
  ) on table public.cards to anon;
exception
  when undefined_object or undefined_column then
    grant select (id, name, bank, active, created_at, last4)
      on table public.cards to anon;
end $$;

-- deduct_sale_stock solo se usa desde el servidor (register_sale).
-- Se revoca a anon si esa RPC ya existe (migration-v5.13).
do $$
begin
  if to_regprocedure('public.register_sale(jsonb)') is not null then
    revoke execute on function public.deduct_sale_stock(uuid, jsonb, text, text, uuid, text) from anon;
  end if;
end $$;

-- Ventas insertadas desde anon: siempre con almacén válido.
drop policy if exists "sales_insert_pin" on public.sales;
create policy "sales_insert_pin" on public.sales
  for insert to anon
  with check (warehouse_id is not null);


-- ############################################################
-- ## 5 · v5.20 · traspasos y cierre desde el PIN + login con usuario
-- ############################################################

-- =====================================================
-- MANNOL POS · Migración v5.20 — Traspasos y cierre desde el PIN + login con usuario
-- =====================================================
-- Problema: al entrar a un almacén con PIN la app NO inicia sesión en
-- Supabase (rol "anon"). Las tablas transfer_requests y daily_closures solo
-- permitían escribir/leer a usuarios "authenticated", así que «Solicitar
-- traspaso» fallaba con «No se pudo enviar» y el cierre de caja tampoco
-- se guardaba.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- =====================================================

-- ---------- 1) Solicitudes de traspaso ----------
alter table public.transfer_requests enable row level security;

-- Usuarios con cuenta (admin / gestor / vendedor)
drop policy if exists transfer_requests_insert on public.transfer_requests;
create policy transfer_requests_insert on public.transfer_requests
  for insert to authenticated with check (true);

drop policy if exists transfer_requests_read on public.transfer_requests;
create policy transfer_requests_read on public.transfer_requests
  for select to authenticated using (true);

drop policy if exists transfer_requests_update_admin on public.transfer_requests;
create policy transfer_requests_update_admin on public.transfer_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.auth_uid = auth.uid() and u.role = 'admin' and u.active
    )
  );

-- Acceso por PIN (anon): solo CREAR solicitudes pendientes y leerlas.
-- No puede aprobarlas ni rechazarlas (eso sigue siendo del admin).
drop policy if exists transfer_requests_insert_pin on public.transfer_requests;
create policy transfer_requests_insert_pin on public.transfer_requests
  for insert to anon
  with check (
    status = 'PENDIENTE'
    and resolved_by is null
    and resolved_at is null
    and from_warehouse_id <> to_warehouse_id
  );

drop policy if exists transfer_requests_read_pin on public.transfer_requests;
create policy transfer_requests_read_pin on public.transfer_requests
  for select to anon using (true);

grant select, insert on public.transfer_requests to anon;
grant select, insert, update on public.transfer_requests to authenticated;

-- ---------- 2) Cierre de caja ----------
alter table public.daily_closures enable row level security;

drop policy if exists daily_closures_insert_pin on public.daily_closures;
create policy daily_closures_insert_pin on public.daily_closures
  for insert to anon with check (warehouse_id is not null);

-- Solo se puede actualizar el cierre de hoy / ayer (margen por zona horaria)
drop policy if exists daily_closures_update_pin on public.daily_closures;
create policy daily_closures_update_pin on public.daily_closures
  for update to anon
  using (closure_date >= current_date - 1)
  with check (closure_date >= current_date - 1);

drop policy if exists daily_closures_read_pin on public.daily_closures;
create policy daily_closures_read_pin on public.daily_closures
  for select to anon using (true);

grant select, insert, update on public.daily_closures to anon;

-- ===== Verificación (opcional) =====
-- select policyname, roles, cmd from pg_policies
--  where tablename in ('transfer_requests','daily_closures') order by 1;

-- ---------- 3) Iniciar sesión con el NOMBRE DE USUARIO ----------
-- La app acepta «usuario» o «email». Con usuario, busca su email aquí.
-- Solo devuelve el email de usuarios ACTIVOS; nada más de la tabla.
create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select lower(u.email)
    from public.users u
   where lower(u.username) = lower(trim(p_username))
     and u.active
   limit 1
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;


-- ############################################################
-- ## 5 · v5.21 · recargos del pago mixto + avisos de traspaso
-- ############################################################

-- =====================================================
-- MANNOL POS · Migración v5.21 — Recargos del pago mixto + avisos de traspaso
-- =====================================================
-- Ejecutar DESPUÉS de migration-v5.20.sql, en:
-- Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotente: se puede ejecutar varias veces.
-- =====================================================

-- ---------- 1) Recargos del pago mixto (Admin → Tasas) ----------
alter table public.settings
  add column if not exists mix_surcharge_options jsonb not null default '[10, 20]'::jsonb,
  add column if not exists mix_surcharge_default numeric not null default 10;

-- Las sesiones PIN (anon) necesitan leerlos para cobrar
grant select (mix_surcharge_options, mix_surcharge_default) on table public.settings to anon;

-- ---------- 2) Avisos en vivo de solicitudes de traspaso ----------
-- Sin esto el panel admin no se enteraba al momento de una solicitud nueva
-- (la app ahora también revisa cada 45 s como respaldo).
do $$
declare
  t text;
begin
  foreach t in array array['transfer_requests', 'daily_closures'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- ya estaba en la publicación
    end;
  end loop;
end $$;

-- ===== Verificación (opcional) =====
-- select mix_surcharge_options, mix_surcharge_default from public.settings;
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';


-- ############################################################
-- ## 6 · Protección (RLS) de movimientos de tarjeta y traspasos
-- ############################################################
-- Estas dos tablas (de la v3) quedaron sin RLS: cualquiera con la clave
-- pública podía leerlas o escribirlas. Ahora:
--   · card_movements: solo usuarios con cuenta leen; el acceso por PIN solo
--     puede ANOTAR el cobro por transferencia de una venta (tipo SALE).
--   · stock_transfers: solo usuarios con cuenta activos.

alter table public.card_movements enable row level security;

drop policy if exists card_movements_read on public.card_movements;
create policy card_movements_read on public.card_movements
  for select to authenticated using (public.is_active_user());

drop policy if exists card_movements_insert on public.card_movements;
create policy card_movements_insert on public.card_movements
  for insert to authenticated with check (public.is_active_user());

drop policy if exists card_movements_insert_pin on public.card_movements;
create policy card_movements_insert_pin on public.card_movements
  for insert to anon with check (movement_type = 'SALE');

drop policy if exists card_movements_update_admin on public.card_movements;
create policy card_movements_update_admin on public.card_movements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists card_movements_delete_admin on public.card_movements;
create policy card_movements_delete_admin on public.card_movements
  for delete to authenticated using (public.is_admin());

alter table public.stock_transfers enable row level security;

drop policy if exists stock_transfers_read on public.stock_transfers;
create policy stock_transfers_read on public.stock_transfers
  for select to authenticated using (public.is_active_user());

drop policy if exists stock_transfers_insert on public.stock_transfers;
create policy stock_transfers_insert on public.stock_transfers
  for insert to authenticated with check (public.is_active_user());

drop policy if exists stock_transfers_update on public.stock_transfers;
create policy stock_transfers_update on public.stock_transfers
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists stock_transfers_delete_admin on public.stock_transfers;
create policy stock_transfers_delete_admin on public.stock_transfers
  for delete to authenticated using (public.is_admin());

-- ===== Fin. Comprobación (opcional): tablas sin RLS (debería salir vacío) =====
-- select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;


-- ############################################################
-- ## 7 · Funciones de cifrado de Supabase (pgcrypto vive en «extensions»)
-- ############################################################
-- digest(), crypt() y gen_salt() están en el esquema «extensions» de
-- Supabase. Sin esto, validar el PIN fallaba con «function digest does
-- not exist» (la app decía «No se pudo validar el PIN»).
alter function public.verify_warehouse_pin(text, text) set search_path = public, extensions;
alter function public.recompute_pin_hash() set search_path = public, extensions;
alter function public.create_admin_user(text, text, text, text, text, uuid[]) set search_path = public, extensions;
alter function public.change_user_password(uuid, text) set search_path = public, extensions;


-- ############################################################
-- ## 8 · Cierre de caja: fondo inicial, arqueo y ventas por marca (v5.24)
-- ############################################################
alter table public.daily_closures
  add column if not exists opening_float jsonb,          -- fondo con el que abre el día {USD, MN, EUR}
  add column if not exists opened_at timestamptz,
  add column if not exists opened_by_name text,
  add column if not exists counted_cash jsonb,           -- efectivo contado al cerrar {USD, MN, EUR}
  add column if not exists cash_difference jsonb,        -- contado − esperado (+ sobra / − falta)
  add column if not exists cash_note text,               -- explicación (ej. venta que no se subió)
  add column if not exists by_brand jsonb not null default '[]'::jsonb,
  add column if not exists closed boolean not null default true;  -- false = caja abierta (solo fondo)


-- ############################################################
-- ## 9 · v5.26 · Comisión por venta + dos vendedores con PIN propio
-- ############################################################
-- Re-ejecutable. Hace tres cosas:
--   a) Regla de comisión del vendedor POR VENTA (Admin → Comisiones vendedores).
--   b) Almacenes con dos vendedores que entran cada uno con SU PIN.
--   c) Cada venta guarda qué vendedor la hizo (seller_slot).

-- a) Regla: venta desde 25 USD → 1 USD; menos → 0.40 USD (editable en la app)
alter table public.settings
  add column if not exists vendor_sale_rule jsonb not null
    default '{"enabled": true, "threshold": 25, "above": 1, "below": 0.4}'::jsonb;
grant select (vendor_sale_rule) on table public.settings to anon;

-- b) Modo de vendedores del almacén:
--    one = una persona · weekend = L-V y fin de semana · pin = dos, cada uno con su PIN
alter table public.warehouses
  add column if not exists seller_mode text not null default 'one',
  add column if not exists seller2_pin text,
  add column if not exists seller2_pin_salt text,
  add column if not exists seller2_pin_hash text;
do $$
begin
  alter table public.warehouses
    add constraint warehouses_seller_mode_chk check (seller_mode in ('one', 'weekend', 'pin'));
exception when duplicate_object then null;
end $$;
update public.warehouses set seller_mode = 'weekend'
  where seller_weekend_split and seller_mode = 'one';
comment on column public.warehouses.seller_mode is
  'v5.26: one = una persona; weekend = dos por días (seller_name L-V, seller_weekend_name S-D); pin = dos con PIN propio (vendedor 1: seller_name + pin; vendedor 2: seller_weekend_name + seller2_pin).';
-- Las sesiones PIN leen el modo (nunca el PIN)
grant select (seller_mode) on table public.warehouses to anon;

-- c) Qué vendedor registró la venta (1 o 2) en almacenes con dos PIN
alter table public.sales add column if not exists seller_slot smallint;

-- Hash del PIN del vendedor 2 (igual que el del almacén)
create or replace function public.recompute_seller2_pin_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text := nullif(btrim(coalesce(new.seller2_pin, '')), '');
  v_salt text := nullif(new.seller2_pin_salt, '');
begin
  if v_pin is null then
    new.seller2_pin_salt := null;
    new.seller2_pin_hash := null;
  else
    if v_salt is null then
      v_salt := encode(gen_random_bytes(8), 'hex');
    end if;
    new.seller2_pin_salt := v_salt;
    new.seller2_pin_hash := encode(digest(v_pin || v_salt, 'sha256'), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_warehouses_seller2_pin_hash on public.warehouses;
create trigger trg_warehouses_seller2_pin_hash
  before insert or update of seller2_pin, seller2_pin_salt on public.warehouses
  for each row execute function public.recompute_seller2_pin_hash();

update public.warehouses set seller2_pin = seller2_pin
  where seller2_pin is not null and seller2_pin_hash is null;

-- Validar el PIN: ahora sabe de qué vendedor es (p_seller = 1 o 2)
drop function if exists public.verify_warehouse_pin(text, text);
create or replace function public.verify_warehouse_pin(p_code text, p_pin text, p_seller int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  wh public.warehouses%rowtype;
  v_pin text;
  v_source text;
  v_salt text;
  v_hash text;
  v_ok boolean := false;
  v_fails int := 0;
  v_retry_sec int := 0;
  v_slot int := null;
  v_seller_name text := null;
begin
  if p_code is null or p_pin is null or btrim(p_pin) = '' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  select * into wh from public.warehouses where lower(code) = lower(btrim(p_code)) limit 1;
  if wh.id is null then
    return jsonb_build_object('ok', false, 'reason', 'warehouse_not_found');
  end if;

  select count(*) into v_fails from public.pin_attempts
    where warehouse_id = wh.id and ok = false and attempted_at > now() - interval '10 minutes';
  if v_fails >= 5 then
    select greatest(600 - extract(epoch from (now() - max(attempted_at)))::int, 1) into v_retry_sec
      from public.pin_attempts
      where warehouse_id = wh.id and ok = false and attempted_at > now() - interval '10 minutes';
    return jsonb_build_object('ok', false, 'reason', 'rate_limited', 'retryAfterSec', greatest(v_retry_sec, 1));
  end if;

  if wh.seller_mode = 'pin' then
    v_slot := case when p_seller = 2 then 2 else 1 end;
    v_seller_name := nullif(btrim(coalesce(case when v_slot = 2 then wh.seller_weekend_name else wh.seller_name end, '')), '');
  end if;

  if v_slot = 2 then
    -- Vendedor 2: solo su PIN (sin PIN global de respaldo)
    v_pin := nullif(btrim(coalesce(wh.seller2_pin, '')), '');
    v_source := 'seller2';
    v_salt := wh.seller2_pin_salt;
    v_hash := wh.seller2_pin_hash;
  else
    v_pin := nullif(btrim(coalesce(wh.pin, '')), '');
    v_source := 'warehouse';
    v_salt := wh.pin_salt;
    v_hash := wh.pin_hash;
    if v_pin is null then
      select nullif(btrim(coalesce(pin_code, '')), ''), pin_salt, pin_hash
        into v_pin, v_salt, v_hash
        from public.settings where id = 'global';
      v_source := 'global';
    end if;
  end if;
  if v_pin is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin_configured', 'seller', v_slot);
  end if;

  if v_hash is not null and v_salt is not null then
    v_ok := (v_hash = encode(digest(btrim(p_pin) || v_salt, 'sha256'), 'hex'));
  else
    v_ok := (btrim(p_pin) = v_pin);
  end if;

  insert into public.pin_attempts (warehouse_id, warehouse_code, ok, device)
    values (wh.id, wh.code, v_ok, null);

  if not v_ok then
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pinSource', v_source,
    'pinLength', length(v_pin),
    'pinSalt', v_salt,
    'pinHash', v_hash,
    'seller', v_slot,
    'sellerName', v_seller_name,
    'warehouse', jsonb_build_object(
      'id', wh.id,
      'name', wh.name,
      'code', wh.code,
      'address', wh.address,
      'phone', wh.phone,
      'active', wh.active,
      'seller_commission_percent', wh.seller_commission_percent,
      'seller_commission_currency', wh.seller_commission_currency,
      'seller_weekend_split', wh.seller_weekend_split,
      'seller_mode', wh.seller_mode,
      'seller_name', wh.seller_name,
      'seller_weekend_name', wh.seller_weekend_name,
      'created_at', wh.created_at
    )
  );
end;
$$;

grant execute on function public.verify_warehouse_pin(text, text, int) to anon, authenticated;

-- Que la API vea la función nueva al momento
notify pgrst, 'reload schema';

-- =====================================================================
-- 10. v5.29.0 — Gestores 5% normal / 3% por caja · Tasa +10 MN fijo
-- (Se puede ejecutar varias veces sin problema)
-- =====================================================================

-- % del gestor en ventas por caja (mayoristas). Ventas normales usan "commission".
alter table public.managers
  add column if not exists commission_wholesale numeric not null default 3;

-- La tasa se sube una cantidad fija (+10 o +20 MN por USD), no un %.
alter table public.rate_config alter column markup_mode set default 'FIXED';
alter table public.rate_config alter column markup_usd  set default 10;
alter table public.rate_config alter column markup_eur  set default 10;

-- Solo cambia si sigue con el valor de fábrica (5%). Si ya lo ajustaste, no se toca.
update public.rate_config
   set markup_mode = 'FIXED', markup_usd = 10, markup_eur = 10
 where markup_mode = 'PERCENT' and markup_usd = 5 and markup_eur = 5;

notify pgrst, 'reload schema';

-- =====================================================================
-- 11. v5.31.0 — Productos con comisión propia del vendedor
--     (cargadores, breakers… van aparte de la regla por venta)
--     Se puede ejecutar varias veces sin problema.
-- =====================================================================
alter table public.products
  add column if not exists own_vendor_commission boolean not null default false;

notify pgrst, 'reload schema';

-- =====================================================================
-- 12. v5.32.0 — El token de elToque solo lo ve el admin
--     Antes cualquiera con la app podía leer rate_config.api_token.
--     Ahora la tabla se lee SIN esa columna; el admin lo lee/guarda con
--     dos funciones que comprueban que sea admin.
--     Se puede ejecutar varias veces sin problema.
-- =====================================================================
revoke select on public.rate_config from anon, authenticated;
grant select (id, api_url, markup_mode, markup_usd, markup_eur, manual_usd_rate, manual_eur_rate,
              last_sync_at, last_usd_rate, last_eur_rate, cache_ttl_minutes, auto_sync)
  on public.rate_config to anon, authenticated;

create or replace function public.get_rate_api_token()
returns text
language sql stable security definer
set search_path = public
as $$
  select case when public.is_admin()
              then (select api_token from public.rate_config where id = 'default')
              else null end;
$$;

create or replace function public.set_rate_api_token(p_token text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el admin puede cambiar el token de elToque';
  end if;
  insert into public.rate_config (id, api_token) values ('default', nullif(trim(p_token), ''))
  on conflict (id) do update set api_token = excluded.api_token;
end;
$$;

revoke all on function public.get_rate_api_token() from public, anon;
revoke all on function public.set_rate_api_token(text) from public, anon;
grant execute on function public.get_rate_api_token() to authenticated;
grant execute on function public.set_rate_api_token(text) to authenticated;

notify pgrst, 'reload schema';

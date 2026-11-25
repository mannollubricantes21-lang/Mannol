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
  sale_id uuid references public.sales(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  user_name text,
  created_at timestamptz not null default now()
);

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

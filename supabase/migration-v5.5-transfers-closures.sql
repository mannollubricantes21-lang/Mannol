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

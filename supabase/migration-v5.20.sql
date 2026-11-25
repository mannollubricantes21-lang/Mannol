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
set search_path = public
as $$
  select lower(u.email)
    from public.users u
   where lower(u.username) = lower(trim(p_username))
     and u.active
   limit 1
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

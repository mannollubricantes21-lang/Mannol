-- =====================================================
-- MANNOL POS · Actualización v2 (ZIP #2)
-- =====================================================
-- Ejecutar DESPUÉS de schema.sql + policies.sql + seed.sql.
-- Aplica: RLS por warehouseIds, índices adicionales, helper functions.
-- =====================================================

-- =====================================================
-- 1. Helper: ¿el usuario actual tiene acceso a un warehouse?
-- =====================================================
-- Un admin tiene acceso a todos. Otros roles solo a los suyos (warehouseIds).

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
-- 2. Actualizar políticas de stock para respetar warehouseIds
-- =====================================================
-- Antes: cualquier usuario activo podía leer/escribir stock de cualquier almacén.
-- Ahora: solo si tiene acceso al almacén (o es admin).

drop policy if exists "stock_read_active" on public.stock;
create policy "stock_read_active" on public.stock
  for select to authenticated using (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_write_active" on public.stock;
create policy "stock_write_active" on public.stock
  for insert to authenticated with check (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_update_active" on public.stock;
create policy "stock_update_active" on public.stock
  for update to authenticated using (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  ) with check (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_delete_active" on public.stock;
create policy "stock_delete_active" on public.stock
  for delete to authenticated using (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

-- =====================================================
-- 3. Actualizar políticas de sales para respetar warehouseIds
-- =====================================================

drop policy if exists "sales_read_active" on public.sales;
create policy "sales_read_active" on public.sales
  for select to authenticated using (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "sales_create_active" on public.sales;
create policy "sales_create_active" on public.sales
  for insert to authenticated with check (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

-- =====================================================
-- 4. Actualizar políticas de stock_movements para respetar warehouseIds
-- =====================================================

drop policy if exists "stock_movements_read_active" on public.stock_movements;
create policy "stock_movements_read_active" on public.stock_movements
  for select to authenticated using (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

drop policy if exists "stock_movements_create_active" on public.stock_movements;
create policy "stock_movements_create_active" on public.stock_movements
  for insert to authenticated with check (
    public.is_admin()
    or public.user_can_access_warehouse(warehouse_id)
  );

-- =====================================================
-- 5. Grant execute en nueva función
-- =====================================================
-- Nota: las RLS de stock/sales siguen aplicando cuando se llama
-- desde adjust_stock y update_sale_status (security definer las
-- bypassa, pero eso es necesario para la atomicidad).

-- =====================================================
-- 6. Índices adicionales para performance
-- =====================================================

create index if not exists idx_sales_created_at on public.sales (created_at desc);
create index if not exists idx_sales_status_created on public.sales (status, created_at desc);
create index if not exists idx_products_category on public.products (category_id) where category_id is not null;
create index if not exists idx_users_role on public.users (role) where active = true;
create index if not exists idx_warehouses_active on public.warehouses (active) where active = true;
create index if not exists idx_managers_active on public.managers (active) where active = true;
create index if not exists idx_cards_active on public.cards (active) where active = true;

-- =====================================================
-- 7. Trigger: cuando un usuario cambia, sincronizar denormalizados
-- =====================================================
-- Si el admin cambia warehouse_id en users, actualizar warehouse_name y warehouse_code.

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
-- 8. Función: change_user_password (RPC segura)
-- =====================================================
-- Permite al admin cambiar la contraseña de un usuario sin exponer service_role.

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
-- 9. Función: deactivate_user (soft delete con auth)
-- =====================================================
-- En lugar de borrar el perfil y dejar el auth user huérfano,
-- desactiva el perfil y bloquea el auth.

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

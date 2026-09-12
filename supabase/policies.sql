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

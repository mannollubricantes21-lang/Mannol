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
set search_path = public
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
  when undefined_object then
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
  when undefined_object then
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
  when undefined_object then
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


-- =====================================================
-- v5.20: traspasos y cierre de caja desde el acceso por PIN (anon)
-- (mismo contenido que migration-v5.20.sql)
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

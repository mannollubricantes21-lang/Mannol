-- =====================================================
-- MANNOL POS · Políticas RLS (Row Level Security)
-- =====================================================
-- Equivalente a firestore.rules pero en Postgres RLS.
-- Ejecutar DESPUÉS de schema.sql.
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
-- 11. stock — lectura/escritura: usuario activo
-- =====================================================
alter table public.stock enable row level security;

drop policy if exists "stock_read_active" on public.stock;
create policy "stock_read_active" on public.stock
  for select to authenticated using (public.is_active_user());

drop policy if exists "stock_write_active" on public.stock;
create policy "stock_write_active" on public.stock
  for insert to authenticated with check (public.is_active_user());

drop policy if exists "stock_update_active" on public.stock;
create policy "stock_update_active" on public.stock
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "stock_delete_active" on public.stock;
create policy "stock_delete_active" on public.stock
  for delete to authenticated using (public.is_active_user());

-- =====================================================
-- 12. stock_movements — lectura usuario activo, create usuario activo
-- =====================================================
alter table public.stock_movements enable row level security;

drop policy if exists "stock_movements_read_active" on public.stock_movements;
create policy "stock_movements_read_active" on public.stock_movements
  for select to authenticated using (public.is_active_user());

drop policy if exists "stock_movements_create_active" on public.stock_movements;
create policy "stock_movements_create_active" on public.stock_movements
  for insert to authenticated with check (public.is_active_user());

-- =====================================================
-- 13. sales — lectura usuario activo, escritura usuario activo (admin/gestor update/delete)
-- =====================================================
alter table public.sales enable row level security;

drop policy if exists "sales_read_active" on public.sales;
create policy "sales_read_active" on public.sales
  for select to authenticated using (public.is_active_user());

drop policy if exists "sales_create_active" on public.sales;
create policy "sales_create_active" on public.sales
  for insert to authenticated with check (public.is_active_user());

drop policy if exists "sales_update_admin_gestor" on public.sales;
create policy "sales_update_admin_gestor" on public.sales
  for update to authenticated using (public.is_admin_or_gestor()) with check (public.is_admin_or_gestor());

drop policy if exists "sales_delete_admin_gestor" on public.sales;
create policy "sales_delete_admin_gestor" on public.sales
  for delete to authenticated using (public.is_admin_or_gestor());

-- =====================================================
-- 14. commission_payouts — lectura usuario activo, escritura admin
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
-- Storage buckets
-- =====================================================
-- Crear buckets públicos para imágenes de productos e imágenes genéricas.
-- Ejecutar en Supabase Dashboard → Storage → New bucket, o vía SQL:

insert into storage.buckets (id, name, public) values ('products', 'products', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('images', 'images', true)
  on conflict (id) do nothing;

-- Políticas de Storage: lectura pública, escritura autenticada
-- Tamaño máx: 5MB, content-type: image/*

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

-- =====================================================
-- Grant execute en funciones RPC públicas
-- =====================================================
grant execute on function public.adjust_stock(uuid, uuid, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.update_sale_status(text, text, text, uuid, text) to authenticated;
grant execute on function public.create_admin_user(text, text, text, text, text, uuid[]) to authenticated;

-- =====================================================
-- Permitir INSERT/UPDATE en stock_movements también desde adjust_stock RPC
-- (security definer ya lo permite, pero por claridad)
-- =====================================================

-- =====================================================
-- MANNOL POS · Datos iniciales (seed)
-- =====================================================
-- Ejecutar DESPUÉS de schema.sql y policies.sql.
-- Crea los datos mínimos para que la app funcione.
-- =====================================================

-- Settings (singleton)
insert into public.settings (id, pin_code, el_toque_enabled, el_toque_markup, business_name)
values ('global', '2025', true, 5, 'MANNOL')
on conflict (id) do nothing;

-- Rate config (singleton)
insert into public.rate_config (
  id, api_url, api_token, markup_mode, markup_usd, markup_eur,
  manual_usd_rate, manual_eur_rate, cache_ttl_minutes, auto_sync
) values (
  'default', 'https://api.eltoque.com/v1/currency/rates', null, 'PERCENT', 5, 5,
  320, 345, 60, true
)
on conflict (id) do nothing;

-- Rates (4 monedas)
insert into public.rates (currency, rate_usd, source, updated_at) values
  ('USD', 1, 'manual', now()),
  ('MN', 1.0/320, 'manual', now()),
  ('EUR', 1.08, 'manual', now()),
  ('TRANSFERENCIA', 1.0/320, 'manual', now())
on conflict (currency) do nothing;

-- =====================================================
-- Crear el usuario admin inicial
-- =====================================================
-- IMPORTANTE: la RPC create_admin_user requiere que el caller esté autenticado.
-- Para crear el primer admin (antes de tener sesión), sigue estos pasos:
--
-- 1. Ve a Supabase Dashboard → Authentication → Users → "Add user"
--    Email: admin@mannol.cu  Password: <tu-contraseña-segura>
--    Click "Create user"
--
-- 2. Anota el UUID del usuario recién creado (aparece en la lista).
--
-- 3. Ejecuta este SQL (reemplaza <ADMIN_AUTH_UID> con el UUID):
--
--    insert into public.users (auth_uid, username, display_name, email, role, active)
--    values ('<ADMIN_AUTH_UID>'::uuid, 'admin', 'Administrador', 'admin@mannol.cu', 'admin', true);
--
-- Alternativamente, si ya estás autenticado como un usuario temporal y
-- quieres crear el admin vía RPC:
--
--    select public.create_admin_user(
--      'admin@mannol.cu',
--      'CambiaEstaClave2025!',
--      'admin',
--      'Administrador',
--      'admin',
--      '{}'::uuid[]
--    );
-- =====================================================

-- Demo warehouses (solo si no existen aún)
insert into public.warehouses (name, code, address, phone, active, pin, seller_commission_percent, seller_commission_currency)
select * from (values
  ('Víbora',         'VIB', 'Obispo #45, Habana Vieja',   '+53 7 866-2020', true, '2611', 3, 'USD'),
  ('Lisa',           'LIS', 'Av. 51 #7308, La Lisa',        '+53 7 855-3030', true, '5807', 3, 'USD'),
  ('Playa',          'PLY', 'Calle 70 #1108, Miramar',      '+53 7 855-4040', true, '7310', 4, 'USD'),
  ('Centro Habana',  'CHB', 'Galiano #258, Centro Habana',  '+53 7 866-5050', true, '3009', 3, 'USD')
) as t(name, code, address, phone, active, pin, seller_commission_percent, seller_commission_currency)
where not exists (select 1 from public.warehouses limit 1);

-- Demo managers
insert into public.managers (name, code, phone, email, commission, active)
select * from (values
  ('Carlos Martínez',  'CM', '+53 5 123-4567', 'carlos@mannol.cu', 5, true),
  ('Ana Rodríguez',    'AR', '+53 5 234-5678', 'ana@mannol.cu',    5, true),
  ('José Pérez',       'JP', '+53 5 345-6789', 'jose@mannol.cu',   7, true),
  ('María González',   'MG', '+53 5 456-7890', 'maria@mannol.cu',  5, true)
) as t(name, code, phone, email, commission, active)
where not exists (select 1 from public.managers limit 1);

-- Demo cards
insert into public.cards (name, number, bank, active)
select * from (values
  ('BPA Principal',    '9225-6789-0123-4567', 'BPA',    true),
  ('BANDEC Ventas',    '9226-1111-2222-3333', 'BANDEC', true),
  ('BANMET Oficial',   '9227-4444-5555-6666', 'BANMET', true),
  ('BPA Secundaria',   '9225-7777-8888-9999', 'BPA',    true)
) as t(name, number, bank, active)
where not exists (select 1 from public.cards limit 1);

-- Demo categories (con sort_order, no order — bug resuelto)
insert into public.categories (name, slug, color, icon, parent_id, sort_order, active)
select v.name, v.slug, v.color, v.icon, v.parent_id, v.sort_order, v.active
from (values
  ('Aceites de Motor', 'aceites-motor', 'emerald', '🛢️'::text, null::uuid, 1, true),
  ('Filtros',          'filtros',       'blue',    '🔧', null, 2, true),
  ('Líquidos',         'liquidos',      'cyan',    '💧', null, 3, true),
  ('Accesorios',       'accesorios',    'amber',   '⚙️', null, 4, true)
) as v(name, slug, color, icon, parent_id, sort_order, active)
where not exists (select 1 from public.categories limit 1);

-- Subcategorías (dependen de categorías creadas arriba)
insert into public.subcategories (category_id, name, slug, sort_order, active)
select c.id, v.name, v.slug, v.sort_order, v.active
from public.categories c
cross join (values
  ('Sintéticos',  'sinteticos', 1, true),
  ('Minerales',   'minerales',  2, true)
) as v(name, slug, sort_order, active)
where c.slug = 'aceites-motor'
  and not exists (select 1 from public.subcategories limit 1);

insert into public.subcategories (category_id, name, slug, sort_order, active)
select c.id, v.name, v.slug, v.sort_order, v.active
from public.categories c
cross join (values
  ('Aceite', 'aceite', 1, true),
  ('Aire',   'aire',   2, true)
) as v(name, slug, sort_order, active)
where c.slug = 'filtros'
  and not exists (select 1 from public.subcategories where slug in ('aceite','aire'));

-- Demo products
insert into public.products (name, brand, sku, viscosity, volume_liters, category_id, category_name, cost_price, sale_price, min_stock, gestor_commission, gestor_commission_currency, vendor_commission, vendor_commission_currency, active)
select v.name, v.brand, v.sku, v.viscosity, v.volume_liters, c.id, v.category_name, v.cost_price, v.sale_price, v.min_stock, v.gestor_commission, v.gestor_commission_currency, v.vendor_commission, v.vendor_commission_currency, v.active
from (values
  ('MANNOL Energy Formula 5W-30',    'MANNOL', 'MN-7511', '5W-30',  4::numeric, 'Sintéticos',  18::numeric, 25::numeric, 5, 1.5::numeric, 'USD', 100::numeric, 'MN', true),
  ('MANNOL Energy Formula 10W-40',    'MANNOL', 'MN-7512', '10W-40', 4::numeric, 'Sintéticos',  16::numeric, 22::numeric, 5, 1.2::numeric, 'USD',  90::numeric, 'MN', true),
  ('MANNOL Universal 15W-40',          'MANNOL', 'MN-7515', '15W-40', 4::numeric, 'Minerales',   12::numeric, 17::numeric, 8, 1.0::numeric, 'USD',  70::numeric, 'MN', true),
  ('MANNOL Diesel 5W-30',              'MANNOL', 'MN-7521', '5W-30',  5::numeric, 'Sintéticos',  22::numeric, 30::numeric, 5, 1.8::numeric, 'USD', 120::numeric, 'MN', true),
  ('MANNOL Premium 0W-20',             'MANNOL', 'MN-7531', '0W-20',  4::numeric, 'Sintéticos',  28::numeric, 38::numeric, 3, 2.5::numeric, 'USD', 150::numeric, 'MN', true),
  ('Filtro de Aceite Mannol W712/93', 'MANNOL', 'MN-W71293', null,  null,       'Aceite',        3::numeric,  5::numeric, 10, 0.5::numeric, 'USD',  20::numeric, 'MN', true),
  ('Filtro de Aceite Mannol W610/1',  'MANNOL', 'MN-W6101',  null,  null,       'Aceite',        3::numeric,  5::numeric, 10, 0.5::numeric, 'USD',  20::numeric, 'MN', true),
  ('Filtro de Aire Mannol C30530',     'MANNOL', 'MN-C30530', null,  null,       'Aire',          5::numeric,  8::numeric,  8, 0.8::numeric, 'USD',  30::numeric, 'MN', true),
  ('Líquido Frenos Mannol DOT 4',      'MANNOL', 'MN-9890',  null,  1::numeric, 'Líquidos',      3::numeric,  5::numeric, 10, 0.5::numeric, 'USD',  20::numeric, 'MN', true),
  ('Refrigerante Mannol G12+',         'MANNOL', 'MN-4012',  null,  1::numeric, 'Líquidos',      4::numeric,  7::numeric, 10, 0.7::numeric, 'USD',  25::numeric, 'MN', true),
  ('Líquido Limpiaparabrisas -10°C',   'MANNOL', 'MN-9930',  null,  4::numeric, 'Líquidos',      4::numeric,  7::numeric,  8, 0.7::numeric, 'USD',  25::numeric, 'MN', true),
  ('Grasa Multiuso Mannol 400g',       'MANNOL', 'MN-8020',  null,  null,       'Accesorios',    4::numeric,  7::numeric,  8, 0.7::numeric, 'USD',  25::numeric, 'MN', true)
) as v(name, brand, sku, viscosity, volume_liters, category_name, cost_price, sale_price, min_stock, gestor_commission, gestor_commission_currency, vendor_commission, vendor_commission_currency, active)
join public.categories c on c.name = v.category_name
where not exists (select 1 from public.products limit 1);

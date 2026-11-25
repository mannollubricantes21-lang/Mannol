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
  when undefined_object then
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
  when undefined_object then
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
  when undefined_object then
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

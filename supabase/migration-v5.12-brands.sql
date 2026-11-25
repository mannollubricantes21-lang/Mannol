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

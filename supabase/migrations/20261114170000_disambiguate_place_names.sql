-- Places with the same name in the same city could not be told apart in rankings and search
-- (two "Loppokaffee" in Kiel, three "Starbucks" in one street...). Every place now carries a
-- name that is unique within its city:
--   * the two Kiel Loppokaffee places get the names the shops use themselves,
--   * every other same-name place gets its street appended: "Coffee Fellows – Wall",
--     or the street with house number when a street has several of them.
-- The OpenStreetMap crawler overwrites names on every run, so the rule lives in
-- disambiguate_place_names(), which the crawler calls after each import. Names an admin has
-- edited (locked_fields contains 'name') are never touched. Idempotent: the base name is
-- recovered from the OSM tags (or by stripping the suffix again), so re-running changes nothing.

create or replace function public.disambiguate_place_names(p_city_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform set_config('cosurfing.bulk', 'on', true);

  with cand as (
    select p.id,
           p.city_id,
           p.name,
           p.name_local,
           p.osm_tags ->> 'name' as osm_name,
           'name' = any(p.locked_fields) as locked,
           nullif(btrim(split_part(coalesce(p.address, ''), ',', 1)), '') as line1
      from public.places p
     where p.source = 'osm'
       and p.status <> 'archived'
       and (p_city_id is null or p.city_id = p_city_id)
  ),
  streets as (
    select c.*,
           nullif(
             btrim(
               regexp_replace(
                 regexp_replace(c.line1, '\s+\d+[[:alpha:]]?(\s*[-–/]\s*\d+[[:alpha:]]?)*$', ''),
                 '^\d+[[:alpha:]]?\s+', ''
               )
             ),
             ''
           ) as street
      from cand c
  ),
  based as (
    select s.*,
           case
             when s.locked then s.name
             when s.name_local is null and nullif(btrim(s.osm_name), '') is not null then left(btrim(s.osm_name), 120)
             when s.line1 is not null and right(s.name, length(' – ' || s.line1)) = ' – ' || s.line1
               then left(s.name, length(s.name) - length(' – ' || s.line1))
             when s.street is not null and right(s.name, length(' – ' || s.street)) = ' – ' || s.street
               then left(s.name, length(s.name) - length(' – ' || s.street))
             else s.name
           end as base
      from streets s
  ),
  by_street as (
    select b.*,
           case
             when b.locked then b.name
             when b.street is not null
              and count(*) over (partition by b.city_id, lower(b.base)) > 1
               then b.base || ' – ' || b.street
             else b.base
           end as cand1
      from based b
  ),
  final as (
    select y.*,
           case
             when y.locked then y.name
             when y.line1 is not null
              and y.line1 is distinct from y.street
              and y.cand1 <> y.base
              and count(*) over (partition by y.city_id, lower(y.cand1)) > 1
               then y.base || ' – ' || y.line1
             else y.cand1
           end as new_name
      from by_street y
  ),
  changed as (
    update public.places p
       set name = left(f.new_name, 120)
      from final f
     where p.id = f.id
       and not f.locked
       and p.name is distinct from left(f.new_name, 120)
    returning 1
  )
  select count(*) into v_count from changed;

  perform set_config('cosurfing.bulk', 'off', true);
  return v_count;
end;
$$;

revoke all on function public.disambiguate_place_names(uuid) from public, anon, authenticated;

-- The shops' own names (as on their maps listings) for the two Kiel Loppokaffee places; locked so
-- the crawler keeps them.
update public.places
   set name = 'Loppokaffee Café',
       locked_fields = case when 'name' = any(locked_fields) then locked_fields else array_append(locked_fields, 'name') end
 where slug = 'loppokaffee-kiel-7133975195'
   and address like 'Jungfernstieg%';

update public.places
   set name = 'Loppokaffee Rösterei & Café',
       locked_fields = case when 'name' = any(locked_fields) then locked_fields else array_append(locked_fields, 'name') end
 where slug = 'loppokaffee-kiel'
   and address like 'Grasweg%';

select public.disambiguate_place_names(null);

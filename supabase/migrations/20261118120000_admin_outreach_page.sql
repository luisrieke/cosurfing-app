-- Outreach list for the admin panel, filtered and paged in the database. There are tens of
-- thousands of published places, far too many to load into the browser at once.

create index if not exists places_published_name_idx
  on public.places (name, id) where status = 'published';

create or replace function public.admin_outreach(
  p_stage text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_pattern text;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with matching as (
    select p.id, p.slug, p.name, p.address, p.website, c.name as city_name,
           coalesce(o.stage, 'to_contact') as stage
      from public.places p
      left join public.cities c on c.id = p.city_id
      left join public.place_outreach o on o.place_id = p.id
     where p.status = 'published'
       and (v_pattern is null or p.name ilike v_pattern or c.name ilike v_pattern)
  ),
  page as (
    select * from matching
     where p_stage is null or stage = p_stage
     order by name, id
     limit least(greatest(p_limit, 1), 200)
    offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(s.stage, s.n) from (
      select stage, count(*) as n from matching group by stage
    ) s), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'slug', slug, 'name', name, 'address', address, 'website', website,
      'city', case when city_name is null then null else jsonb_build_object('name', city_name) end,
      'stage', stage
    ) order by name, id) from page), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_outreach(text, text, integer, integer) from public, anon;
grant execute on function public.admin_outreach(text, text, integer, integer) to authenticated;

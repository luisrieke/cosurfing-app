-- Places created from a user suggestion are marked as such (the column default is 'admin').
create or replace function public.approve_suggestion(p_id uuid, p_slug text, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.place_suggestions%rowtype;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  select * into s from public.place_suggestions where id = p_id for update;
  if s.id is null then
    raise exception 'suggestion not found';
  end if;
  if s.city_id is null then
    raise exception 'suggestion has no city';
  end if;
  insert into public.places (city_id, slug, name, category, status, address, website, description, lat, lng, source)
  values (s.city_id, p_slug, s.name, s.category, 'draft', s.address, s.website, s.notes, p_lat, p_lng, 'user')
  returning id into new_id;
  update public.place_suggestions set status = 'approved' where id = p_id;
  return new_id;
end;
$$;

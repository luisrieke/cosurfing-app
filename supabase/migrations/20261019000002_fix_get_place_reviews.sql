-- get_place_reviews declares an OUT column named `status`, which made the unqualified
-- `select category, status into ...` ambiguous at runtime. Qualify the columns.
create or replace function public.get_place_reviews(p_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  user_id uuid,
  rating integer,
  body text,
  author_name text,
  created_at timestamptz,
  updated_at timestamptz,
  is_locked boolean,
  is_own boolean,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text;
  v_status text;
  v_unlocked boolean;
  v_uid uuid := auth.uid();
begin
  select places.category, places.status
    into v_category, v_status
    from public.places
   where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  v_unlocked := v_category = 'coworking' or public.is_admin() or public.is_plus();
  return query
    select r.id,
           r.place_id,
           case when v_unlocked or r.user_id = v_uid or public.is_admin() then r.user_id else null end as user_id,
           r.rating,
           case when v_unlocked or r.user_id = v_uid then r.body else null end as body,
           case when v_unlocked or r.user_id = v_uid then coalesce(pr.display_name, 'Cosurfer') else null end as author_name,
           r.created_at,
           r.updated_at,
           (not v_unlocked and r.user_id is distinct from v_uid) as is_locked,
           (r.user_id = v_uid) as is_own,
           r.status
    from public.reviews r
    left join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place_id
      and (r.status = 'visible' or r.user_id = v_uid or public.is_admin())
    order by r.created_at desc;
end;
$$;

-- Review points follow the effort, like Google Local Guides: stars only 3, with text 10,
-- 200+ characters another 10, and 5 more for the first review a place gets.
-- Keep in step with src/lib/points.ts.

alter table public.reviews
  add column first_on_place boolean not null default false,
  add column source text check (
    source is null or source in ('form', 'quick', 'welcome', 'email_prompt', 'email_live', 'venue')
  );

-- The first review is fixed when it goes live, so later approvals of older reviews never take it away.
update public.reviews r
   set first_on_place = true
  from (
    select distinct on (place_id) id
      from public.reviews
     where status = 'visible'
     order by place_id, created_at, id
  ) f
 where r.id = f.id;

create or replace function public.reviews_set_first()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.first_on_place := false;
  else
    new.first_on_place := old.first_on_place;
    new.source := coalesce(old.source, new.source);
  end if;
  if new.status = 'visible'
     and (tg_op = 'INSERT' or old.status <> 'visible')
     and not new.first_on_place
     and not exists (
       select 1 from public.reviews o
        where o.place_id = new.place_id and o.id <> new.id and (o.status = 'visible' or o.first_on_place)
     )
  then
    new.first_on_place := true;
  end if;
  return new;
end;
$$;

-- Runs after reviews_moderate (triggers fire in name order), so the final status is known.
drop trigger if exists reviews_set_first on public.reviews;
create trigger reviews_set_first
  before insert or update on public.reviews
  for each row execute function public.reviews_set_first();

create or replace function public.review_points(p_body text)
returns integer
language sql
immutable
as $$
  select case
    when p_body is null or char_length(btrim(p_body)) = 0 then 3
    when char_length(btrim(p_body)) >= 200 then 20
    else 10
  end;
$$;

create or replace function public.contribution_totals(p_user uuid)
returns table (
  points integer,
  points_pending integer,
  approved_count integer,
  rejected_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select
      (select count(*) from public.reviews where user_id = p_user and status = 'visible') as reviews_ok,
      (select coalesce(sum(public.review_points(body) + case when first_on_place then 5 else 0 end), 0)
         from public.reviews where user_id = p_user and status = 'visible') as reviews_ok_pts,
      (select coalesce(sum(public.review_points(body)), 0)
         from public.reviews where user_id = p_user and status = 'pending') as reviews_wait_pts,
      (select count(*) from public.reviews where user_id = p_user and status in ('rejected', 'hidden')) as reviews_no,
      (select count(*) from public.place_photos where uploaded_by = p_user and status = 'approved') as photos_ok,
      (select count(*) from public.place_photos where uploaded_by = p_user and status = 'pending') as photos_wait,
      (select count(*) from public.place_photos where uploaded_by = p_user and status = 'rejected') as photos_no,
      (select count(*) from public.place_suggestions where user_id = p_user and status = 'approved') as suggestions_ok,
      (select count(*) from public.place_suggestions where user_id = p_user and status = 'pending') as suggestions_wait,
      (select count(*) from public.place_suggestions where user_id = p_user and status = 'rejected') as suggestions_no,
      (select count(*) from public.speed_tests where user_id = p_user and status = 'visible') as tests_ok,
      (select count(*) from public.place_facts where user_id = p_user and status = 'approved') as facts_ok,
      (select count(*) from public.place_facts where user_id = p_user and status = 'pending') as facts_wait,
      (select count(*) from public.place_facts where user_id = p_user and status = 'rejected') as facts_no,
      (select count(*) from public.place_menus where user_id = p_user and status = 'approved') as menus_ok,
      (select count(*) from public.place_menus where user_id = p_user and status = 'pending') as menus_wait,
      (select count(*) from public.place_menus where user_id = p_user and status = 'rejected') as menus_no,
      (select count(*) from public.place_offers where user_id = p_user and status = 'approved') as offers_ok,
      (select count(*) from public.place_offers where user_id = p_user and status = 'pending') as offers_wait,
      (select count(*) from public.place_offers where user_id = p_user and status = 'rejected') as offers_no,
      (select coalesce(edit_rejections, 0) from public.profiles where id = p_user) as edits
  )
  select
    (reviews_ok_pts + reviews_wait_pts
      + photos_ok * 5 + photos_wait * 5
      + suggestions_ok * 5 + suggestions_wait * 5
      + tests_ok * 5
      + facts_ok * 2 + facts_wait * 2
      + menus_ok * 5 + menus_wait * 5
      + offers_ok * 2 + offers_wait * 2)::integer,
    (reviews_wait_pts + photos_wait * 5 + suggestions_wait * 5
      + facts_wait * 2 + menus_wait * 5 + offers_wait * 2)::integer,
    (reviews_ok + photos_ok + suggestions_ok + facts_ok + menus_ok + offers_ok)::integer,
    (reviews_no + photos_no + suggestions_no + facts_no + menus_no + offers_no + edits)::integer
  from c;
$$;

-- ---------------------------------------------------------------------------
-- Readers: is_first on reviews, first reviews on profiles
-- ---------------------------------------------------------------------------

drop function if exists public.get_place_reviews(uuid);
create function public.get_place_reviews(p_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  user_id uuid,
  rating integer,
  body text,
  author_name text,
  author_points integer,
  wifi_rating integer,
  power_rating integer,
  quiet_rating integer,
  comfort_rating integer,
  value_rating integer,
  calls_ok boolean,
  visited_at date,
  has_body boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_locked boolean,
  body_locked boolean,
  is_own boolean,
  status text,
  author_id uuid,
  author_avatar_path text,
  author_points_pending integer,
  author_is_guide boolean,
  edit_status text,
  coffee_program boolean,
  is_first boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_uid uuid := auth.uid();
  v_signed_in boolean := auth.uid() is not null;
  v_all_bodies boolean := public.is_plus() or public.is_admin();
begin
  select places.status into v_status from public.places where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  return query
    select r.id,
           r.place_id,
           case when r.user_id = v_uid or public.is_admin() then r.user_id end,
           r.rating,
           case when x.body_visible then r.body end,
           case when v_signed_in then coalesce(pr.display_name, 'Cosurfer') end,
           case when v_signed_in then pr.points end,
           case when v_signed_in then r.wifi_rating end,
           case when v_signed_in then r.power_rating end,
           case when v_signed_in then r.quiet_rating end,
           case when v_signed_in then r.comfort_rating end,
           case when v_signed_in then r.value_rating end,
           case when v_signed_in then r.calls_ok end,
           case when v_signed_in then r.visited_at end,
           r.body is not null,
           r.created_at,
           r.updated_at,
           not v_signed_in,
           r.body is not null and not x.body_visible,
           coalesce(r.user_id = v_uid, false),
           r.status,
           case when v_signed_in then r.user_id end,
           case when v_signed_in then pr.avatar_path end,
           case when v_signed_in then pr.points_pending end,
           coalesce(pr.is_guide, false),
           case when r.user_id = v_uid or public.is_admin() then r.edit_status end,
           -- The coffee program migration may run before or after this one.
           coalesce((to_jsonb(r) ->> 'coffee_program')::boolean, false),
           r.first_on_place
      from public.reviews r
      left join public.profiles pr on pr.id = r.user_id
      cross join lateral (
        select v_all_bodies
            or coalesce(r.user_id = v_uid, false)
            or (v_signed_in and exists (
                  select 1 from public.review_unlocks u where u.user_id = v_uid and u.review_id = r.id
                )) as body_visible
      ) x
     where r.place_id = p_place_id
       and (r.status = 'visible' or r.user_id = v_uid or public.is_admin())
     order by (r.body is not null) desc, r.created_at desc;
end;
$$;

drop function if exists public.get_profile_reviews(uuid);
create function public.get_profile_reviews(p_user uuid)
returns table (
  id uuid,
  place_id uuid,
  place_slug text,
  place_name text,
  place_category text,
  rating integer,
  body text,
  has_body boolean,
  created_at timestamptz,
  status text,
  edit_status text,
  is_own boolean,
  body_locked boolean,
  is_first boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.place_id,
         p.slug,
         p.name,
         p.category,
         r.rating,
         case when x.body_visible then r.body end,
         r.body is not null,
         r.created_at,
         r.status,
         case when auth.uid() = p_user or public.is_admin() then r.edit_status end,
         coalesce(auth.uid() = p_user, false),
         r.body is not null and not x.body_visible,
         r.first_on_place
    from public.reviews r
    join public.places p on p.id = r.place_id and (p.status = 'published' or public.is_admin())
    cross join lateral (
      select public.is_plus()
          or public.is_admin()
          or coalesce(auth.uid() = p_user, false)
          or (auth.uid() is not null and exists (
                select 1 from public.review_unlocks u where u.user_id = auth.uid() and u.review_id = r.id
              )) as body_visible
    ) x
   where r.user_id = p_user
     and (
       r.status = 'visible'
       or ((auth.uid() = p_user or public.is_admin()) and r.status in ('pending', 'rejected', 'hidden'))
     )
   order by r.created_at desc;
$$;

drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(p_user uuid)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  points integer,
  points_pending integer,
  is_guide boolean,
  review_count integer,
  photo_count integer,
  guide_revoked boolean,
  first_review_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id,
         coalesce(pr.display_name, 'Cosurfer'),
         pr.avatar_path,
         pr.points,
         pr.points_pending,
         pr.is_guide,
         pr.review_count,
         (select count(*)::integer from public.place_photos ph where ph.uploaded_by = pr.id and ph.status = 'approved'),
         public.is_admin() and exists (select 1 from public.guide_revokes g where g.user_id = pr.id),
         (select count(*)::integer from public.reviews r where r.user_id = pr.id and r.status = 'visible' and r.first_on_place)
    from public.profiles pr
   where pr.id = p_user;
$$;

revoke all on function public.reviews_set_first() from public, anon, authenticated;
grant execute on function public.get_place_reviews(uuid) to anon, authenticated;
grant execute on function public.get_profile_reviews(uuid) to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.refresh_profile_stats(r.id);
  end loop;
end $$;

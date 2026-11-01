-- Position of a place in its city's default ranking, with the same tie-breakers as get_city_ranking.
create or replace function public.get_place_rank(p_place_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 1 + count(*)::int
    from public.places me
    join public.places p
      on p.city_id = me.city_id
     and p.status = 'published'
     and p.id <> me.id
     and (p.work_score > me.work_score
       or (p.work_score = me.work_score and p.review_count > me.review_count)
       or (p.work_score = me.work_score and p.review_count = me.review_count and p.name < me.name))
   where me.id = p_place_id
     and me.status = 'published';
$$;

revoke all on function public.get_place_rank(uuid) from public;
grant execute on function public.get_place_rank(uuid) to anon, authenticated;

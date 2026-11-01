-- Adds a rank to the city leaderboard so clients have a stable key without exposing user ids.
drop function if exists public.get_city_contributors(uuid, integer);

create function public.get_city_contributors(p_city_id uuid, p_limit integer default 5)
returns table (
  rank bigint,
  display_name text,
  points integer,
  city_reviews bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select row_number() over (order by count(*) desc, pr.points desc, pr.id) as rank,
         coalesce(pr.display_name, 'Cosurfer'), pr.points, count(*) as city_reviews
    from public.reviews r
    join public.places p on p.id = r.place_id and p.city_id = p_city_id and p.status = 'published'
    join public.profiles pr on pr.id = r.user_id
   where r.status = 'visible'
   group by pr.id, pr.display_name, pr.points
   order by rank
   limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function public.get_city_contributors(uuid, integer) to anon, authenticated;

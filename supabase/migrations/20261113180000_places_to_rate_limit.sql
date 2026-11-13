-- The "which places do you know?" picker lists more places than onboarding does, so allow up to 100 rows.
-- Existing callers ask for 20 or fewer and are unaffected.
create or replace function public.get_places_to_rate(p_city_id uuid, p_limit integer default 6)
returns table (id uuid, slug text, name text, category text, address text, work_score numeric, review_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.category, p.address, p.work_score, p.review_count
    from public.places p
   where auth.uid() is not null
     and p.city_id = p_city_id
     and p.status = 'published'
     and p.category <> 'coliving'
     and not exists (select 1 from public.reviews r where r.place_id = p.id and r.user_id = auth.uid())
   order by p.work_score desc, p.review_count desc
   limit least(greatest(p_limit, 1), 100);
$$;

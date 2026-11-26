-- Places whose venue forbids laptop work cannot be rated: new reviews are refused and the rating
-- picker no longer offers them. Existing reviews stay so moderation keeps working on them.

create or replace function public.reviews_block_work_forbidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.places p
     where p.id = new.place_id and public.place_work_forbidden(p.laptop_hours, p.laptop_source)
  ) then
    raise exception 'work_forbidden' using hint = 'This place does not allow laptop work and cannot be rated.';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_block_work_forbidden on public.reviews;
create trigger reviews_block_work_forbidden
  before insert on public.reviews
  for each row execute function public.reviews_block_work_forbidden();

create or replace function public.get_places_to_rate(p_city_id uuid, p_limit integer default 6)
returns table(id uuid, slug text, name text, category text, address text, work_score numeric, review_count integer)
language sql
stable security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.category, p.address, p.work_score, p.review_count
    from public.places p
   where auth.uid() is not null
     and p.city_id = p_city_id
     and p.status = 'published'
     and p.category <> 'coliving'
     and not public.place_work_forbidden(p.laptop_hours, p.laptop_source)
     and not exists (select 1 from public.reviews r where r.place_id = p.id and r.user_id = auth.uid())
   order by p.work_score desc, p.review_count desc
   limit least(greatest(p_limit, 1), 20);
$$;

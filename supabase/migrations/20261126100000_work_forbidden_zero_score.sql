-- Places whose venue told us laptop work is never allowed (laptop_source 'venue' and "none" on every
-- day) score 0, so they sink to the bottom of every ranking. Mirrors workForbidden in src/lib/hours.ts.
-- places_score runs after places_hours (BEFORE triggers fire by name), so laptop_source is final here.

create or replace function public.place_work_forbidden(p_laptop jsonb, p_source text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_source = 'venue'
     and p_laptop is not null
     and (select bool_and(p_laptop -> d ->> 'mode' = 'none')
            from unnest(array['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']) d)
$$;

create or replace function public.places_set_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.place_rating_stats;
  b jsonb;
begin
  if public.place_work_forbidden(new.laptop_hours, new.laptop_source) then
    new.work_score := 0;
    new.score_breakdown := jsonb_build_object(
      'score', 0, 'reviews', 0, 'wifi', 0, 'facts', 0, 'completeness', 0, 'category', 0, 'work_forbidden', true
    );
    return new;
  end if;
  select * into s from public.place_rating_stats where place_id = new.id;
  b := public.compute_place_score(new, s);
  new.work_score := (b ->> 'score')::numeric;
  new.score_breakdown := b;
  return new;
end;
$$;

-- Rescore places that are already marked.
update public.places
   set work_score = work_score
 where public.place_work_forbidden(laptop_hours, laptop_source);

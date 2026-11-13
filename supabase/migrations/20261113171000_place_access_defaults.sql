-- Default access for every place, by kind of place:
--   cafes, libraries                              open
--   coworking spaces of the big flexible-office   members (membership, contract or booking)
--     chains (WeWork, Design Offices, Regus, ...)
--   other coworking spaces                        registration (book or sign up first)
--   colivings                                     members (residents only), registration when
--                                                 the coliving says outsiders can work there
-- Admins can still change any place by hand. New places get the same default on insert.

create or replace function public.default_place_access(p_category text, p_name text, p_non_guest_work text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_category in ('cafe', 'library') then 'open'
    when p_category = 'coworking' then
      case when coalesce(p_name, '') ~* '^(we ?work|design offices|die macherei|regus|mindspace|industrious|techspace)(\W|$)'
           then 'members' else 'registration' end
    when p_category = 'coliving' then case when p_non_guest_work = 'yes' then 'registration' else 'members' end
    else 'unknown'
  end;
$$;

create or replace function public.places_default_access()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.access = 'unknown' then
    new.access := public.default_place_access(new.category, new.name, new.non_guest_work);
  end if;
  return new;
end;
$$;

create trigger places_default_access
  before insert on public.places
  for each row execute function public.places_default_access();

revoke all on function public.places_default_access() from public, anon, authenticated;

update public.places
   set access = public.default_place_access(category, name, non_guest_work)
 where access = 'unknown';

notify pgrst, 'reload schema';

-- Members can name up to three cities they work in. The first one stays the home city.

alter table public.profiles
  add column city_ids uuid[] not null default '{}',
  add constraint profiles_city_ids_max check (cardinality(city_ids) <= 3);

update public.profiles set city_ids = array[home_city_id] where home_city_id is not null;

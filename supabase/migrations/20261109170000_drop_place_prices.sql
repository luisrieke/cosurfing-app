-- Members no longer type in prices; menu photos (place_menus) replace them.

drop function if exists public.get_place_prices(uuid);
drop function if exists public.save_place_prices(uuid, jsonb);
drop table if exists public.place_prices;

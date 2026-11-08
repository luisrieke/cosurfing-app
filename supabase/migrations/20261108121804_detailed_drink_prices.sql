-- Split the single coffee price into individual drinks. Keep price items in sync with src/lib/prices.ts.

delete from public.place_prices where item = 'coffee';

alter table public.place_prices drop constraint place_prices_item_check;
alter table public.place_prices add constraint place_prices_item_check check (item in (
  'espresso', 'americano', 'cappuccino', 'tea', 'lemonade', 'water_033', 'water_075', 'lunch',
  'week_pass', 'flex_desk_month', 'fixed_desk_month', 'meeting_room_hour',
  'membership_year'
));

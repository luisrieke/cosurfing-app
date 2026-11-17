-- Review points by effort and the first review of a place. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into public.cities (id, slug, name, country_code, country_name, lat, lng, status)
values ('10000000-0000-0000-0000-0000000000c0', 'pointtown', 'Pointtown', 'DE', 'Germany', 52.5, 13.4, 'active');

insert into public.places (id, city_id, slug, name, category, status, lat, lng) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c0', 'points-one', 'Points One', 'cafe', 'published', 52.5, 13.4),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c0', 'points-two', 'Points Two', 'cafe', 'published', 52.5, 13.4);

select is(public.review_points(null), 3, 'stars only earn 3');
select is(public.review_points('Good wifi.'), 10, 'a text earns 10');
select is(public.review_points(repeat('x', 200)), 20, '200 characters earn the bonus');

-- c1 reviews first but waits for approval; c2 is approved first and keeps the first review.
insert into public.reviews (place_id, user_id, rating, body, source) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 4, null, 'quick');
insert into public.reviews (place_id, user_id, rating, body) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 5, 'Quiet and fast wifi.');

select is(
  (select first_on_place from public.reviews where user_id = '00000000-0000-0000-0000-0000000000c1'),
  false,
  'a pending review is not the first review yet'
);

update public.reviews set status = 'visible' where user_id = '00000000-0000-0000-0000-0000000000c2';
update public.reviews set status = 'visible', source = 'form' where user_id = '00000000-0000-0000-0000-0000000000c1';

select results_eq(
  $$ select user_id::text, first_on_place from public.reviews
      where place_id = '20000000-0000-0000-0000-0000000000c1' order by user_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1', false), ('00000000-0000-0000-0000-0000000000c2', true) $$,
  'the first review to go live keeps the bonus'
);

select is(
  (select source from public.reviews where user_id = '00000000-0000-0000-0000-0000000000c1'),
  'quick',
  'the source of the first save is kept'
);

select is(
  (select points from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  15,
  'a text review that is first earns 10 + 5'
);

select is(
  (select points from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  3,
  'a stars-only review earns 3'
);

select * from finish();
rollback;

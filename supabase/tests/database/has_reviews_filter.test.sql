-- "Has reviews" filter on get_city_ranking. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-00000000000a');
-- Act as the admin so moderation updates below are allowed.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into public.cities (id, slug, name, country_code, country_name, lat, lng, status)
values ('10000000-0000-0000-0000-000000000000', 'reviewtown', 'Reviewtown', 'DE', 'Germany', 52.5, 13.4, 'active');

insert into public.places (id, city_id, slug, name, category, status, lat, lng, wifi) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'visible-one', 'Visible One', 'coworking', 'published', 52.5, 13.4, 'yes'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'pending-only', 'Pending Only', 'cafe', 'published', 52.5, 13.4, 'unknown'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'hidden-only', 'Hidden Only', 'cafe', 'published', 52.5, 13.4, 'unknown'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'rejected-only', 'Rejected Only', 'cafe', 'published', 52.5, 13.4, 'unknown'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', 'deleted-only', 'Deleted Only', 'cafe', 'published', 52.5, 13.4, 'unknown'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', 'draft-reviewed', 'Draft Reviewed', 'cafe', 'draft', 52.5, 13.4, 'unknown'),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000000', 'no-reviews', 'No Reviews', 'cafe', 'published', 52.5, 13.4, 'yes'),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000000', 'two-visible', 'Two Visible', 'cafe', 'published', 52.5, 13.4, 'unknown');

-- The admin is a trusted author, so their reviews are visible at once; the others' wait as pending.
insert into public.reviews (place_id, user_id, rating) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 5),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 4),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 4),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a', 4),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 3),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1', 3),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b1', 3),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000b2', 2);

update public.reviews set status = 'hidden' where place_id = '20000000-0000-0000-0000-000000000003';
update public.reviews set status = 'rejected' where place_id = '20000000-0000-0000-0000-000000000004';
update public.reviews set status = 'visible'
 where place_id = '20000000-0000-0000-0000-000000000008' and user_id = '00000000-0000-0000-0000-0000000000b2';
delete from public.reviews where place_id = '20000000-0000-0000-0000-000000000005';

select results_eq(
  $$ select slug from public.get_city_ranking('10000000-0000-0000-0000-000000000000', p_sort => 'name', p_reviewed => true) $$,
  $$ values ('two-visible'), ('visible-one') $$,
  'only published places with a visible review match'
);

select is(
  (select total_count from public.get_city_ranking('10000000-0000-0000-0000-000000000000', p_reviewed => true) limit 1),
  2::bigint,
  'total_count reflects the filter'
);

select is(
  (select review_count from public.get_city_ranking('10000000-0000-0000-0000-000000000000', p_reviewed => true)
    where slug = 'two-visible'),
  2,
  'review_count counts every visible review'
);

select is(
  (select review_count from public.places where slug = 'pending-only'),
  0,
  'pending reviews are not counted'
);

select is(
  (select review_count from public.places where slug = 'hidden-only') + (select review_count from public.places where slug = 'rejected-only'),
  0,
  'hidden and rejected reviews are not counted'
);

select is(
  (select review_count from public.places where slug = 'deleted-only'),
  0,
  'deleted reviews are not counted'
);

select is(
  (select count(*) from public.get_city_ranking('10000000-0000-0000-0000-000000000000')),
  7::bigint,
  'without the filter every published place is listed'
);

select results_eq(
  $$ select slug from public.get_city_ranking('10000000-0000-0000-0000-000000000000', p_wifi => true, p_reviewed => true) $$,
  $$ values ('visible-one') $$,
  'combines with the Wi-Fi filter'
);

select results_eq(
  $$ select slug from public.get_city_ranking('10000000-0000-0000-0000-000000000000', p_category => 'cafe', p_reviewed => true) $$,
  $$ values ('two-visible') $$,
  'combines with the category tabs'
);

select is_empty(
  $$ select slug from public.get_city_ranking('10000000-0000-0000-0000-000000000000', p_q => 'no reviews', p_reviewed => true) $$,
  'combines with search'
);

select * from finish();
rollback;

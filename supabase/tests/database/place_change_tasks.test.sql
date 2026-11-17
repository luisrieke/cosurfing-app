-- Follow-up tasks for community changes. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-00000000000a');
-- Act as the admin so moderation updates and the admin RPC below are allowed.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into public.cities (id, slug, name, country_code, country_name, lat, lng, status)
values ('10000000-0000-0000-0000-000000000000', 'tasktown', 'Tasktown', 'DE', 'Germany', 52.5, 13.4, 'active');

insert into public.places (id, city_id, slug, name, category, status, lat, lng, wifi) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'task-one', 'Task One', 'cafe', 'published', 52.5, 13.4, 'yes'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'task-two', 'Task Two', 'cafe', 'published', 52.5, 13.4, 'yes');

-- Not trusted: the review waits for approval, so there is no task yet.
insert into public.reviews (place_id, user_id, rating) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 4),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 3);

select is(
  (select count(*) from public.place_change_tasks),
  0::bigint,
  'pending changes do not create a task'
);

-- Approving the review creates one open task.
update public.reviews set status = 'visible'
 where place_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000b1';

select results_eq(
  $$ select status, kind_counts from public.place_change_tasks
      where place_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values ('open'::text, '{"review": 1}'::jsonb) $$,
  'approving a review opens a task'
);

-- Rejecting does not.
update public.reviews set status = 'rejected'
 where place_id = '20000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-0000000000b2';

select is(
  (select count(*) from public.place_change_tasks where user_id = '00000000-0000-0000-0000-0000000000b2'),
  0::bigint,
  'rejected changes do not create a task'
);

-- A fact by the same member on the same place is merged into the open task.
insert into public.place_facts (place_id, user_id, key, value, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'wifi', 'true'::jsonb, 'pending');
update public.place_facts set status = 'approved'
 where place_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000b1' and key = 'wifi';

select is(
  (select count(*) from public.place_change_tasks where place_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a second change merges into the open task'
);

select results_eq(
  $$ select kind_counts, fact_keys from public.place_change_tasks
      where place_id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values ('{"review": 1, "fact": 1}'::jsonb, array['wifi']::text[]) $$,
  'the merged task counts both changes and remembers the fact key'
);

-- Editing a live review (trusted path or an approved edit) is a change too.
update public.reviews set rating = 5
 where place_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select (kind_counts ->> 'review')::int from public.place_change_tasks
    where place_id = '20000000-0000-0000-0000-000000000001'),
  2,
  'a live review edit is counted'
);

-- Admin changes never create a task.
insert into public.reviews (place_id, user_id, rating) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 5);

select is(
  (select count(*) from public.place_change_tasks where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'changes by admins are ignored'
);

-- Closing the task sets completed_at, reopening clears it.
-- (now() is frozen inside the test transaction, so backdate the first task.)
update public.place_change_tasks
   set status = 'done', thanked_at = now(), reached_out_at = now(), created_at = now() - interval '1 day'
 where place_id = '20000000-0000-0000-0000-000000000001';

select isnt(
  (select completed_at from public.place_change_tasks where place_id = '20000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'closing a task records completed_at'
);

-- A new change after the task was closed opens a new task for the same place.
insert into public.place_facts (place_id, user_id, key, value, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'laptops', '"welcome"'::jsonb, 'pending');
update public.place_facts set status = 'approved'
 where place_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000b1' and key = 'laptops';

select is(
  (select count(*) from public.place_change_tasks where place_id = '20000000-0000-0000-0000-000000000001'),
  2::bigint,
  'a change after the task was closed opens a new task'
);

select is(
  (select count(*) from public.place_change_tasks
    where place_id = '20000000-0000-0000-0000-000000000001' and status = 'open'),
  1::bigint,
  'only the new task is open'
);

-- The list marks places that were listed before.
select is(
  (select previous_count from public.admin_get_place_change_tasks() where status = 'open'),
  1,
  'the new task knows the place was listed before'
);

select isnt(
  (select previous_reached_out_at from public.admin_get_place_change_tasks() where status = 'open'),
  null::timestamptz,
  'the new task shows when the place was reached out to before'
);

select is(
  (select previous_count from public.admin_get_place_change_tasks() where status = 'done'),
  0,
  'the first task has no earlier listing'
);

select * from finish();
rollback;

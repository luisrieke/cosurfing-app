-- Evaluate auth.uid() / is_admin() once per statement instead of once per row (Supabase advisor 0003),
-- and index foreign keys that are used for joins and cascades (advisor 0001).

alter policy "read own entitlement" on public.entitlements
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "own favorites" on public.favorites
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "create report" on public.place_reports
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_reports.place_id and p.status = 'published')
  );

alter policy "read own reports" on public.place_reports
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "create suggestion" on public.place_suggestions
  with check (user_id = (select auth.uid()));

alter policy "read own suggestions" on public.place_suggestions
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "read own profile" on public.profiles
  using (id = (select auth.uid()) or (select public.is_admin()));

alter policy "update own profile" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "delete own review" on public.reviews
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "read own reviews" on public.reviews
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "update own review" on public.reviews
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check ((select public.is_admin()) or (user_id = (select auth.uid()) and status = 'visible'));

alter policy "write own review" on public.reviews
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = reviews.place_id and p.status = 'published')
  );

alter policy "delete own speed test" on public.speed_tests
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "read own speed tests" on public.speed_tests
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy "write own speed test" on public.speed_tests
  with check (
    user_id = (select auth.uid())
    and status = 'visible'
    and exists (select 1 from public.places p where p.id = speed_tests.place_id and p.status = 'published')
  );

create index if not exists favorites_place_idx on public.favorites (place_id);
create index if not exists place_reports_place_idx on public.place_reports (place_id);
create index if not exists place_reports_user_idx on public.place_reports (user_id);
create index if not exists place_suggestions_city_idx on public.place_suggestions (city_id);
create index if not exists place_suggestions_user_idx on public.place_suggestions (user_id);
create index if not exists profiles_home_city_idx on public.profiles (home_city_id);

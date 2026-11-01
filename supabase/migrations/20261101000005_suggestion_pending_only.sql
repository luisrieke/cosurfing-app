-- New suggestions always start in the admin review queue; users cannot insert them as approved or rejected.
alter policy "create suggestion" on public.place_suggestions
  with check (user_id = (select auth.uid()) and status = 'pending');

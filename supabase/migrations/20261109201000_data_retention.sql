-- Retention periods promised in the privacy policy (app/privacy.tsx). Runs daily.

create or replace function public.purge_expired_personal_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Speed tests: the location evidence is only needed to verify the test; the result stays.
  update public.speed_tests
     set lat = null, lng = null, accuracy_m = null, ip_hash = null
   where created_at < now() - interval '30 days'
     and (lat is not null or lng is not null or accuracy_m is not null or ip_hash is not null);

  -- City waiting list: unconfirmed sign-ups and people who left, 30 days later.
  delete from public.city_waitlist_entries
   where (status = 'pending' and created_at < now() - interval '30 days')
      or (status = 'left' and coalesce(left_at, updated_at) < now() - interval '30 days');
  update public.city_waitlist_entries
     set ip_hash = null
   where ip_hash is not null and created_at < now() - interval '30 days';

  -- Technical rate-limit counters.
  delete from public.rate_limits where window_start < now() - interval '7 days';

  -- Content reports: guests' email addresses are only needed until we have told them the decision.
  update public.content_reports
     set reporter_email = null
   where reporter_email is not null and decided_at < now() - interval '180 days';
  delete from public.moderation_notices where sent_at < now() - interval '1 year';
end;
$$;

revoke all on function public.purge_expired_personal_data() from public, anon, authenticated;

select cron.schedule('cosurfing-purge-personal-data', '41 3 * * *', $$select public.purge_expired_personal_data()$$);

-- Place verification: places whose website is parked (domain for sale) or dead, or that users
-- report as permanently closed, move to status 'needs_review'. They disappear from every public
-- query (all of them filter on status = 'published') until an admin confirms or archives them.

alter table public.places drop constraint if exists places_status_check;
alter table public.places
  add constraint places_status_check check (status in ('draft', 'published', 'needs_review', 'archived'));

alter table public.places drop constraint if exists places_web_crawl_status_check;
alter table public.places
  add constraint places_web_crawl_status_check
  check (web_crawl_status in ('pending', 'running', 'done', 'failed', 'blocked', 'skipped', 'parked', 'dead'));

alter table public.places
  add column review_reason text check (review_reason in ('website_parked', 'website_dead', 'reported_closed')),
  add column flagged_website text,
  add column website_status text check (website_status in ('ok', 'parked', 'dead')),
  add column website_fail_count integer not null default 0;

create index places_needs_review_idx on public.places (updated_at desc) where status = 'needs_review';

-- ---------------------------------------------------------------------------
-- Crawler: recheck dead sites after a few days, hide places on parked/dead websites
-- ---------------------------------------------------------------------------

create or replace function public.claim_enrich_batch(p_limit integer default 20)
returns table (
  id uuid,
  name text,
  category text,
  website text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.places
     set web_crawl_status = 'pending'
   where web_crawl_status = 'running' and web_crawled_at < now() - interval '15 minutes';
  return query
    with picked as (
      select p.id from public.places p
       where p.website is not null
         and p.status = 'published'
         and (
           p.web_crawl_status = 'pending'
           or (p.web_crawl_status = 'dead' and p.web_crawled_at < now() - interval '3 days')
           or (p.web_crawl_status in ('done', 'failed', 'blocked') and p.web_crawled_at < now() - interval '90 days')
         )
       order by (p.web_crawl_status = 'pending') desc, p.work_score desc
       limit least(greatest(p_limit, 1), 50)
       for update skip locked
    )
    update public.places p
       set web_crawl_status = 'running', web_crawled_at = now()
      from picked
     where p.id = picked.id
    returning p.id, p.name, p.category, p.website;
end;
$$;

-- Recent reviews or speed tests prove the place exists; recently verified places stay too.
create or replace function public.place_recently_confirmed(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.places p
            where p.id = p_place_id
              and (p.last_verified_at > current_date - 365 or 'status' = any(p.locked_fields))
         )
      or exists (select 1 from public.reviews r where r.place_id = p_place_id and r.created_at > now() - interval '12 months')
      or exists (select 1 from public.speed_tests s where s.place_id = p_place_id and s.created_at > now() - interval '12 months');
$$;

-- Clears a parked/dead website (and everything read from it) and hides the place for review.
create or replace function public.flag_bad_website(p_place_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep boolean := public.place_recently_confirmed(p_place_id);
begin
  update public.places
     set flagged_website = coalesce(website, flagged_website),
         website = null,
         web_facts = '{}'::jsonb,
         website_status = case when p_reason = 'website_parked' then 'parked' else 'dead' end,
         status = case when status = 'published' and not v_keep then 'needs_review' else status end,
         review_reason = case when status = 'published' and not v_keep then p_reason else review_reason end
   where id = p_place_id
     and not ('website' = any(locked_fields));
end;
$$;

create or replace function public.save_web_facts(p_place_id uuid, p_status text, p_facts jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fails integer;
begin
  update public.places
     set web_crawl_status = p_status,
         web_crawled_at = now(),
         web_facts = case when p_status = 'done' then coalesce(p_facts, '{}'::jsonb) else web_facts end,
         website_status = case when p_status = 'done' then 'ok' else website_status end,
         website_fail_count = case
           when p_status = 'done' then 0
           when p_status = 'dead' then website_fail_count + 1
           else website_fail_count end,
         opening_hours = case
           when p_status = 'done' and opening_hours is null and not ('opening_hours' = any(locked_fields)) and p_facts ? 'opening_hours'
             then p_facts -> 'opening_hours' ->> 'value'
           else opening_hours end
   where id = p_place_id
  returning website_fail_count into v_fails;

  if p_status = 'parked' then
    perform public.flag_bad_website(p_place_id, 'website_parked');
  elsif p_status = 'dead' and v_fails >= 2 then
    perform public.flag_bad_website(p_place_id, 'website_dead');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- User reports: "permanently closed / doesn't exist"
-- ---------------------------------------------------------------------------

alter table public.place_reports
  add column kind text not null default 'other' check (kind in ('other', 'closed'));

create unique index place_reports_one_closed_per_user
  on public.place_reports (place_id, user_id) where kind = 'closed' and status = 'open';

create or replace function public.place_reports_closed_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporters integer;
begin
  if new.kind <> 'closed' then
    return null;
  end if;
  select count(distinct user_id) into v_reporters
    from public.place_reports
   where place_id = new.place_id and kind = 'closed' and status = 'open';
  if v_reporters >= 2 then
    update public.places
       set status = 'needs_review', review_reason = 'reported_closed'
     where id = new.place_id and status = 'published' and not ('status' = any(locked_fields));
  end if;
  return null;
end;
$$;

create trigger place_reports_closed
  after insert on public.place_reports
  for each row execute function public.place_reports_closed_trigger();

-- ---------------------------------------------------------------------------
-- Admin review
-- ---------------------------------------------------------------------------

-- 'exists': publish again (optionally with a corrected website, which is then locked).
-- 'closed': archive and lock the status so OSM re-crawls do not bring the place back.
create or replace function public.review_place(p_place_id uuid, p_decision text, p_website text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_website text := nullif(trim(coalesce(p_website, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_decision not in ('exists', 'closed') then
    raise exception 'invalid decision';
  end if;
  if v_website is not null and v_website !~* '^https?://[^\s/]+\.[^\s]+$' then
    raise exception 'invalid website';
  end if;

  if p_decision = 'exists' then
    update public.places
       set status = 'published',
           review_reason = null,
           last_verified_at = current_date,
           website = coalesce(v_website, website),
           website_status = case when v_website is not null then null else website_status end,
           website_fail_count = 0,
           web_crawl_status = case when v_website is not null then 'pending' else web_crawl_status end,
           locked_fields = case
             when v_website is not null and not ('website' = any(locked_fields)) then locked_fields || 'website'
             else locked_fields end
     where id = p_place_id;
  else
    update public.places
       set status = 'archived',
           locked_fields = case when 'status' = any(locked_fields) then locked_fields else locked_fields || 'status' end
     where id = p_place_id;
  end if;

  update public.place_reports set status = 'resolved'
   where place_id = p_place_id and kind = 'closed' and status = 'open';
end;
$$;

revoke all on function public.place_recently_confirmed(uuid) from public, anon, authenticated;
revoke all on function public.flag_bad_website(uuid, text) from public, anon, authenticated;
revoke all on function public.save_web_facts(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_enrich_batch(integer) from public, anon, authenticated;
revoke all on function public.place_reports_closed_trigger() from public, anon, authenticated;
revoke all on function public.review_place(uuid, text, text) from public, anon;
grant execute on function public.review_place(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Places whose stored "About" text is a domain-sale page (e.g. "ChangeBox.org is for sale on Spaceship").
select public.flag_bad_website(p.id, 'website_parked')
  from public.places p
 where p.web_facts -> 'description' ->> 'value' ~*
   '([a-z0-9-]+\.[a-z]{2,}[^.]{0,20}\mis (now )?for sale|domain[^.]{0,40}for sale|buy this domain|domain may be for sale|domain name is for sale|parked (free|domain)|domain parking|domain kaufen|domain[^.]{0,40}(steht zum verkauf|zu verkaufen)|hugedomains|sedo domain|dan\.com)';

-- Recheck every website with the parked/dead detection.
do $$
begin
  perform set_config('cosurfing.bulk', 'on', true);
  update public.places set web_crawl_status = 'pending'
   where website is not null and status = 'published' and web_crawl_status not in ('running', 'skipped');
  perform set_config('cosurfing.bulk', 'off', true);
end;
$$;

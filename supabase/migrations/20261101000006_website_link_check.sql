-- Website links must never land on a dead page. When a stored deep link is gone (404 or a
-- "page not found" page) but the venue's homepage works, the crawler now hands back the homepage
-- and save_web_facts replaces the broken link with it.

drop function if exists public.save_web_facts(uuid, text, jsonb);

create or replace function public.save_web_facts(p_place_id uuid, p_status text, p_facts jsonb, p_website text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fails integer;
  v_website text := nullif(trim(coalesce(p_website, '')), '');
begin
  if v_website is not null and v_website !~* '^https?://[^\s/]+\.[^\s]+$' then
    v_website := null;
  end if;

  update public.places
     set web_crawl_status = p_status,
         web_crawled_at = now(),
         web_facts = case when p_status = 'done' then coalesce(p_facts, '{}'::jsonb) else web_facts end,
         flagged_website = case
           when v_website is not null and v_website is distinct from website and not ('website' = any(locked_fields)) then website
           else flagged_website end,
         website = case
           when v_website is not null and not ('website' = any(locked_fields)) then v_website
           else website end,
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

revoke all on function public.save_web_facts(uuid, text, jsonb, text) from public, anon, authenticated;

-- OSM re-crawls copy the website tag again; a link we already found broken must not come back.
-- Admin edits lock the field and are let through.
create or replace function public.places_keep_bad_website_out()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.website is distinct from old.website
     and new.website = old.flagged_website
     and not ('website' = any(new.locked_fields)) then
    new.website := old.website;
  end if;
  return new;
end;
$$;

drop trigger if exists places_keep_bad_website_out on public.places;
create trigger places_keep_bad_website_out
  before update of website on public.places
  for each row execute function public.places_keep_bad_website_out();

revoke all on function public.places_keep_bad_website_out() from public, anon, authenticated;

-- Recheck every link that was accepted before deep links and "not found" pages were detected.
do $$
begin
  perform set_config('cosurfing.bulk', 'on', true);
  update public.places set web_crawl_status = 'pending'
   where website is not null and status = 'published' and web_crawl_status in ('done', 'failed');
  perform set_config('cosurfing.bulk', 'off', true);
end;
$$;

-- Contact details from venue websites: enrich-places passes them to save_web_facts as p_contacts
-- ({"email": {"value": "...", "url": "page"}, ...}). They go to place_contacts only, never to the public web_facts.
-- A place whose "website" is a social profile (instagram.com/..., wa.me/...) gets that account as contact too.

create or replace function public.place_contacts_from_website(p_website text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_website ~* '^https?://(www\.|m\.)?(instagram\.com|instagr\.am)/' then jsonb_build_object('instagram', p_website)
    when p_website ~* '^https?://([a-z-]+\.)?(facebook\.com|fb\.com)/' then jsonb_build_object('facebook', p_website)
    when p_website ~* '^https?://(www\.|m\.)?tiktok\.com/@' then jsonb_build_object('tiktok', p_website)
    when p_website ~* '^https?://(wa\.me/|api\.whatsapp\.com/send)' then jsonb_build_object('whatsapp', p_website)
    else '{}'::jsonb
  end;
$$;

create or replace function public.place_contacts_on_place_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.merge_place_contacts(
    new.id,
    public.place_contacts_from_website(new.website)
      || public.place_contacts_from_osm(coalesce(new.osm_tags, '{}'::jsonb), new.phone),
    case when new.source = 'osm' then 'osm' else 'listing' end,
    case when new.osm_type is not null and new.osm_id is not null
      then 'https://www.openstreetmap.org/' || new.osm_type || '/' || new.osm_id end
  );
  return new;
end;
$$;

drop trigger place_contacts_sync on public.places;
create trigger place_contacts_sync
  after insert or update of osm_tags, phone, website on public.places
  for each row execute function public.place_contacts_on_place_change();

select public.merge_place_contacts(
  p.id,
  public.place_contacts_from_website(p.website),
  case when p.source = 'osm' then 'osm' else 'listing' end,
  p.website
)
from public.places p
where public.place_contacts_from_website(p.website) <> '{}'::jsonb;

drop function public.save_web_facts(uuid, text, jsonb, text);

create function public.save_web_facts(
  p_place_id uuid,
  p_status text,
  p_facts jsonb,
  p_website text default null,
  p_contacts jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fails integer;
  v_website text := nullif(trim(coalesce(p_website, '')), '');
  v_field text;
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

  if p_status = 'done' and jsonb_typeof(p_contacts) = 'object' then
    for v_field in select jsonb_object_keys(p_contacts) loop
      perform public.merge_place_contacts(
        p_place_id,
        jsonb_build_object(v_field, p_contacts -> v_field ->> 'value'),
        'website',
        p_contacts -> v_field ->> 'url'
      );
    end loop;
  end if;

  if p_status = 'parked' then
    perform public.flag_bad_website(p_place_id, 'website_parked');
  elsif p_status = 'dead' and v_fails >= 2 then
    perform public.flag_bad_website(p_place_id, 'website_dead');
  end if;
end;
$$;

revoke all on function public.save_web_facts(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_web_facts(uuid, text, jsonb, text, jsonb) to service_role;

-- Read the already crawled websites again for their contact details.
update public.places
   set web_crawl_status = 'pending'
 where web_crawl_status = 'done';

-- Contact details of a place (phone, email, social accounts), readable by signed-in users only.
-- Filled from OSM tags (trigger on places) and from the venue's own website (save_web_facts).
-- sources records per field where the value came from: {"email": {"source": "website", "url": "..."}}.

create table public.place_contacts (
  place_id uuid primary key references public.places(id) on delete cascade,
  phone text,
  email text,
  instagram text,
  facebook text,
  whatsapp text,
  tiktok text,
  sources jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.place_contacts enable row level security;

revoke all on public.place_contacts from anon;

-- The places subquery runs with the caller's rights, so contacts of unpublished places stay hidden.
create policy "signed-in users read place contacts" on public.place_contacts
  for select to authenticated
  using (exists (select 1 from public.places p where p.id = place_id));

create policy "admins manage place contacts" on public.place_contacts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Normalisation: one canonical form per field, null when the value is not usable
-- ---------------------------------------------------------------------------

create or replace function public.normalize_place_contact(p_field text, p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(trim(split_part(coalesce(p_value, ''), ';', 1)), '');
begin
  if v is null then
    return null;
  end if;

  if p_field = 'phone' then
    v := regexp_replace(v, '^tel:', '', 'i');
    if v !~ '^[0-9+() ./-]{6,40}$' or length(regexp_replace(v, '\D', '', 'g')) < 6 then
      return null;
    end if;
    return v;

  elsif p_field = 'email' then
    v := lower(regexp_replace(split_part(v, '?', 1), '^mailto:', '', 'i'));
    if v !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
       or v ~ '(example\.(com|org)|domain\.com|email\.com|sentry|wixpress|\.(png|jpe?g|gif|webp|svg)$)' then
      return null;
    end if;
    return v;

  elsif p_field = 'instagram' then
    v := regexp_replace(v, '^(https?://)?(www\.|m\.)?instagr(am\.com|\.am)/', '', 'i');
    v := split_part(split_part(split_part(v, '?', 1), '#', 1), '/', 1);
    v := ltrim(v, '@');
    if v !~ '^[A-Za-z0-9._]{1,30}$' or lower(v) in ('p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'instagram') then
      return null;
    end if;
    return v;

  elsif p_field = 'tiktok' then
    v := regexp_replace(v, '^(https?://)?(www\.|m\.)?tiktok\.com/', '', 'i');
    v := ltrim(split_part(split_part(v, '?', 1), '/', 1), '@');
    if v !~ '^[A-Za-z0-9._]{2,24}$' then
      return null;
    end if;
    return v;

  elsif p_field = 'facebook' then
    if v !~* '^https?://' then
      v := case when v ~* '^(www\.|m\.)?(facebook\.com|fb\.com)/' then 'https://' || v
                else 'https://www.facebook.com/' || ltrim(v, '@') end;
    end if;
    if v !~* '^https?://([a-z-]+\.)?(facebook\.com|fb\.com)/[^\s]+$'
       or v ~* 'facebook\.com/(sharer|share|plugins|tr|dialog|login)' then
      return null;
    end if;
    -- Keep the id of profile.php links, drop tracking parameters elsewhere.
    if v !~* 'profile\.php' then
      v := split_part(v, '?', 1);
    end if;
    return rtrim(v, '/');

  elsif p_field = 'whatsapp' then
    v := regexp_replace(v, '^(https?://)?(wa\.me/|api\.whatsapp\.com/send/?\?phone=|(www\.)?whatsapp\.com/send/?\?phone=)', '', 'i');
    v := regexp_replace(split_part(split_part(v, '?', 1), '&', 1), '\D', '', 'g');
    if length(v) < 7 or length(v) > 15 then
      return null;
    end if;
    return v;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge: website values only fill gaps; OSM / listing values overwrite; admin values are never overwritten
-- ---------------------------------------------------------------------------

create or replace function public.merge_place_contacts(p_place_id uuid, p_values jsonb, p_source text, p_url text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field text;
  v_value text;
  v_current text;
  v_row public.place_contacts;
  v_rec jsonb;
  v_sources jsonb;
  v_changed boolean := false;
begin
  if p_values is null or p_values = '{}'::jsonb then
    return;
  end if;
  select * into v_row from public.place_contacts where place_id = p_place_id for update;
  v_rec := coalesce(to_jsonb(v_row), '{}'::jsonb);
  v_sources := coalesce(v_row.sources, '{}'::jsonb);

  foreach v_field in array array['phone', 'email', 'instagram', 'facebook', 'whatsapp', 'tiktok'] loop
    v_value := public.normalize_place_contact(v_field, p_values ->> v_field);
    continue when v_value is null;
    v_current := v_rec ->> v_field;
    continue when v_current = v_value;
    if v_current is not null and p_source <> 'admin' then
      continue when p_source = 'website' or v_sources -> v_field ->> 'source' = 'admin';
    end if;
    v_rec := jsonb_set(v_rec, array[v_field], to_jsonb(v_value));
    v_sources := jsonb_set(v_sources, array[v_field], jsonb_strip_nulls(jsonb_build_object('source', p_source, 'url', p_url)));
    v_changed := true;
  end loop;

  if not v_changed then
    return;
  end if;
  insert into public.place_contacts as c (place_id, phone, email, instagram, facebook, whatsapp, tiktok, sources, updated_at)
  values (
    p_place_id, v_rec ->> 'phone', v_rec ->> 'email', v_rec ->> 'instagram', v_rec ->> 'facebook',
    v_rec ->> 'whatsapp', v_rec ->> 'tiktok', v_sources, now()
  )
  on conflict (place_id) do update
    set phone = excluded.phone,
        email = excluded.email,
        instagram = excluded.instagram,
        facebook = excluded.facebook,
        whatsapp = excluded.whatsapp,
        tiktok = excluded.tiktok,
        sources = excluded.sources,
        updated_at = now();
end;
$$;

revoke all on function public.merge_place_contacts(uuid, jsonb, text, text) from public, anon, authenticated;

create or replace function public.place_contacts_from_osm(p_tags jsonb, p_phone text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'phone', coalesce(p_phone, p_tags ->> 'phone', p_tags ->> 'contact:phone', p_tags ->> 'mobile', p_tags ->> 'contact:mobile'),
    'email', coalesce(p_tags ->> 'contact:email', p_tags ->> 'email'),
    'instagram', coalesce(p_tags ->> 'contact:instagram', p_tags ->> 'instagram'),
    'facebook', coalesce(p_tags ->> 'contact:facebook', p_tags ->> 'facebook'),
    'whatsapp', coalesce(p_tags ->> 'contact:whatsapp', p_tags ->> 'whatsapp'),
    'tiktok', coalesce(p_tags ->> 'contact:tiktok', p_tags ->> 'tiktok')
  ));
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
    public.place_contacts_from_osm(coalesce(new.osm_tags, '{}'::jsonb), new.phone),
    case when new.source = 'osm' then 'osm' else 'listing' end,
    case when new.osm_type is not null and new.osm_id is not null
      then 'https://www.openstreetmap.org/' || new.osm_type || '/' || new.osm_id end
  );
  return new;
end;
$$;

revoke all on function public.place_contacts_on_place_change() from public, anon, authenticated;

create trigger place_contacts_sync
  after insert or update of osm_tags, phone on public.places
  for each row execute function public.place_contacts_on_place_change();

-- Backfill from what is already stored.
select public.merge_place_contacts(
  p.id,
  public.place_contacts_from_osm(coalesce(p.osm_tags, '{}'::jsonb), p.phone),
  case when p.source = 'osm' then 'osm' else 'listing' end,
  case when p.osm_type is not null and p.osm_id is not null
    then 'https://www.openstreetmap.org/' || p.osm_type || '/' || p.osm_id end
)
from public.places p
where p.phone is not null
   or p.osm_tags ?| array['phone', 'contact:phone', 'mobile', 'contact:mobile', 'email', 'contact:email', 'instagram',
                          'contact:instagram', 'facebook', 'contact:facebook', 'whatsapp', 'contact:whatsapp', 'tiktok', 'contact:tiktok'];

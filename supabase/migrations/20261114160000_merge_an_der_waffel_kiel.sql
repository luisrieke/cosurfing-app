-- "An der Waffel" in Kiel was suggested twice: as "AnDerWaffel" (anderwaffel-kiel, 2026-11-09) and
-- as "An der Waffel" (an-der-waffel-kiel, 2026-11-14). Both sat on Asmus-Bremer-Platz instead of
-- Brunswiker Str. 59, so the pin was in the wrong spot and an on-site speed test counted as too far.
--
-- Keeps an-der-waffel-kiel (its photo files live under its id) and moves every review, fact, photo,
-- speed test and suggestion of the duplicate onto it before deleting the duplicate.
-- Coordinates: OSM node 12723113700 "An der Waffel" (Nominatim, ODbL, checked 2026-11-14).
-- The opening-hours fact is rewritten in the parser's format; the times are the member's own.
-- Idempotent: does nothing once the duplicate is gone.

do $$
declare
  v_keep uuid;
  v_dup uuid;
  v_dup_created timestamptz;
begin
  select id into v_keep from public.places where slug = 'an-der-waffel-kiel';
  select id, created_at into v_dup, v_dup_created from public.places where slug = 'anderwaffel-kiel';
  if v_keep is null or v_dup is null then
    return;
  end if;

  update public.places
     set lat = 54.3285852,
         lng = 10.1355444,
         created_at = least(created_at, v_dup_created)
   where id = v_keep;

  update public.place_facts f
     set place_id = v_keep
   where f.place_id = v_dup
     and not exists (
       select 1 from public.place_facts k
        where k.place_id = v_keep and k.user_id = f.user_id and k.key = f.key
     );

  update public.place_facts
     set value = to_jsonb('Mo-Fr 12:30-18:30; Sa,Su 11:00-19:00'::text)
   where place_id = v_keep
     and key = 'opening_hours'
     and value = to_jsonb('Mo-Fr 12:30h-18:30h Sa,So 11-19:00h'::text);

  update public.reviews r
     set place_id = v_keep
   where r.place_id = v_dup
     and not exists (select 1 from public.reviews k where k.place_id = v_keep and k.user_id = r.user_id);

  update public.favorites f
     set place_id = v_keep
   where f.place_id = v_dup
     and not exists (select 1 from public.favorites k where k.place_id = v_keep and k.user_id = f.user_id);

  update public.place_photos set place_id = v_keep where place_id = v_dup;
  update public.speed_tests set place_id = v_keep where place_id = v_dup;
  update public.place_wifi_notes set place_id = v_keep where place_id = v_dup;
  update public.place_offers set place_id = v_keep where place_id = v_dup;
  update public.place_menus set place_id = v_keep where place_id = v_dup;
  update public.place_reports set place_id = v_keep where place_id = v_dup;
  update public.place_suggestions set place_id = v_keep where place_id = v_dup;
  update public.content_reports set place_id = v_keep where place_id = v_dup;
  update public.moderation_notices set place_id = v_keep where place_id = v_dup;

  delete from public.places where id = v_dup;

  -- Same rule as submit_speed_test, now against the corrected coordinates.
  update public.speed_tests s
     set distance_m = d.m,
         verification = case
           when s.kind = 'wifi' and s.network_type = 'cellular' then 'cellular'
           when s.accuracy_m is null or s.accuracy_m > 100 then 'low_accuracy'
           when d.m - s.accuracy_m > 150 then 'too_far'
           else 'verified'
         end,
         on_site = not (s.kind = 'wifi' and s.network_type = 'cellular')
                   and s.accuracy_m is not null and s.accuracy_m <= 100 and d.m - s.accuracy_m <= 150
    from (
      select t.id,
             round(2 * 6371000 * asin(sqrt(
               power(sin(radians(t.lat - p.lat) / 2), 2)
               + cos(radians(p.lat)) * cos(radians(t.lat)) * power(sin(radians(t.lng - p.lng) / 2), 2)
             )))::int as m
        from public.speed_tests t
        join public.places p on p.id = t.place_id
       where t.place_id = v_keep
         and t.lat is not null and t.lng is not null
    ) d
   where s.id = d.id;

  perform public.refresh_place_hours(v_keep);
  perform public.refresh_place_wifi_community(v_keep);
  -- Recomputes the work score from the merged reviews, facts and speed tests.
  update public.places set updated_at = now() where id = v_keep;
end $$;

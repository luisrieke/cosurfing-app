-- Almería: hand-checked coworking spaces, laptop-friendly cafes and libraries for the new Almería hotspot.
--
-- Researched in November 2026 from each venue's own website and official pages (Junta de Andalucía,
-- Red de Bibliotecas Públicas Municipales de Almería). Prices and hours are the ones published there; where
-- sources disagreed or nothing was published, hours stay empty or the access note says "check before going".
-- Coordinates: Nominatim / OpenStreetMap (ODbL). Left out: Negocia Area (a business centre in Roquetas de
-- Mar, out of town), the University of Almería library (members only) and venues without a first-party source.
--
-- A place that is already on the map (an OpenStreetMap place of the same category within 15 m, a library within
-- 60 m, or any place within 200 m with a similar name) is enriched instead of duplicated: the curated fields are written to that
-- row and locked, so the crawler keeps them. Everything else is added as source 'admin'. Cities that
-- have not been imported yet are skipped, so it is safe to run again after import-cities.mjs and the first
-- crawl. Idempotent; never touches places of other categories or admin rows of another kind.

create or replace function pg_temp.almeria_nk(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(translate(t, 'áàâäéèêëíìîïóòôöúùûüçñÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇÑ', 'aaaaeeeeiiiioooouuuucnAAAAEEEEIIIIOOOOUUUUCN')),
    '[^a-z0-9]', '', 'g'
  )
$$;

do $almeria$
declare
  it record;
  v_city uuid;
  v_id uuid;
  v_osm boolean;
  v_matched uuid[] := '{}';
  v_lock text[];
begin
  perform set_config('cosurfing.bulk', 'on', true);
  for it in
    select * from jsonb_to_recordset($items$[
{"slug":"workspace-coworking-almeria","city":"almeria","name":"WorkSpace Coworking Almería","category":"coworking","description":"Coworking in a restored 19th-century town house at Calle Arráez 11 in Almería's old town, next to Plaza Vieja, the cathedral and the Alcazaba, with 32 flexible desks, fixed desks, private offices, three meeting rooms and a training room. WiFi 6 with 1 Gb symmetric fibre and a second 1 Gb backup line from another provider is advertised, plus coffee and water. Prices (website, 2026, excl. VAT): half day 10 EUR, day 15 EUR, 5 days 60 EUR, 10 days 95 EUR, flex desk from 63 EUR/month, fixed desk 168 EUR/month.","address":"Calle Arráez 11, 04002 Almería","lat":36.8393,"lng":-2.46862,"website":"https://workspace.es/","phone":"+34 625 01 87 67","opening_hours":"Mo-Fr 08:00-19:00","hours_source":"website","day_pass_price_cents":1500,"access":"registration","access_note":"Book and pay day passes online with an account, no need to book ahead. Flex desks Mon-Fri 08:00-19:00 (morning 08:00-14:00, afternoon 13:00-19:00); fixed desks and offices 24/7."},
{"slug":"wood-work-coworking-almeria","city":"almeria","name":"Wood Work Coworking","category":"coworking","description":"Coworking of more than 300 m2 on Calle González Garbín in central Almería, a few metres from Puerta de Purchena and behind the Teatro Apolo, at street level and step-free. It advertises 1 Gb symmetric fibre with a backup line and mesh Wi-Fi, free coffee, tea and water, a chill-out patio, meeting and training rooms, and pets are welcome. Prices (website, excl. 21% VAT): day pass 20 EUR, flex desk 105 EUR/month, fixed desk 145 EUR/month with 24/7 access.","address":"Calle González Garbín 19, local, 04001 Almería","lat":36.84121,"lng":-2.46185,"website":"https://www.woodworkcoworking.com/","phone":"+34 640 323 355","opening_hours":"Mo-Fr 08:30-18:30","hours_source":"website","day_pass_price_cents":2000,"wheelchair":"yes","access":"registration","access_note":"Contact first (WhatsApp, phone or email) to arrange a day, week or hour pass. Day pass and flex desks Mon-Fri 08:30-18:30; fixed desks and offices 24/7 with an electronic key."},
{"slug":"contenido-creativo-coworking-almeria","city":"almeria","name":"Contenido Creativo Coworking","category":"coworking","description":"Small coworking on the first floor of Calle Alcázar 4 in Almería, about 3 minutes on foot from the intermodal station, with equipped desks, a meeting room, a kitchen, a shared patio and an outdoor work area with Wi-Fi. The site advertises symmetric fibre but gives 400 Mbps on one page and 600 Mbps in its FAQ. Prices (website, excl. tax): day pass 15 EUR (includes meeting-room use), flex desk 80 EUR/month Mon-Fri 08:00-20:00, fixed desk 100 EUR/month with 24/7 access.","address":"Calle Alcázar 4, planta 1, 04006 Almería","lat":36.83758,"lng":-2.45112,"website":"https://www.contenidocreativo.es/","phone":"+34 664 89 82 19","opening_hours":"Mo-Fr 08:00-20:00","hours_source":"website","day_pass_price_cents":1500,"outdoor_seating":"yes","access":"registration","access_note":"Contact by phone, WhatsApp or email to book a day pass or a desk. Flex desks Mon-Fri 08:00-20:00; fixed desks 24/7. Monthly desks need a one-month deposit. No private parking."},
{"slug":"craft-coffee-almeria","city":"almeria","name":"CRAFT Coffee","category":"cafe","description":"Specialty coffee cafe on the pedestrian Calle San Francisco de Asís in Almería's old town, serving espresso, V60 and batch brew with plant-based milks, breakfast and lunch with vegan options. It belongs to a small local group that also runs Craft Brunch & Drunch. Free Wi-Fi, laptop-friendly tables, a street terrace and step-free access are reported by listings; the venue's own site does not state a laptop policy.","address":"Calle San Francisco de Asís 2, 04001 Almería","lat":36.84057,"lng":-2.46434,"website":"https://grupocraftcoffee.es/craft-coffee/","phone":"+34 950 00 63 71","opening_hours":"Mo-Fr 08:30-21:00; Sa,Su 09:00-21:00","hours_source":"listing","wheelchair":"yes","outdoor_seating":"yes","access":"open","access_note":"Walk-in. Listings agree on about 08:30-21:00 (weekends from 09:00) but one shows a midday break on Monday and Tuesday: check before going."},
{"slug":"industrial-coffee-almeria","city":"almeria","name":"Industrial Coffee","category":"cafe","description":"Specialty coffee and brunch cafe on the pedestrian stretch of Paseo de Almería with a terrace on Plaza del Ecuador, reopened in December 2025 after the street works. Beans rotate between origins, with cold brew, toasts, bagels and pastries. One source reports Wi-Fi, sockets and moderate noise, but the venue does not state a laptop policy, so treat it as a casual place to work.","address":"Paseo de Almería 34, 04001 Almería","lat":36.83866,"lng":-2.46361,"website":"https://www.industrialcoffeexx.com/","phone":"+34 624 10 72 67","wheelchair":"yes","outdoor_seating":"yes","access":"open","access_note":"Walk-in. Hours differ between sources (venue site shows daily 09:00-21:00, others 08:30-20:30): check before going."},
{"slug":"biblioteca-central-jose-maria-artero-almeria","city":"almeria","name":"Biblioteca Central José María Artero","category":"library","description":"Almería's central municipal library, on Calle Santos Zárate. Its two study rooms have their own entrance, air conditioning and Wi-Fi and are open every day from 08:00 to midnight, including holidays, with no booking. In January and June university exam periods they open 24 hours. The reading seats in the main library are meant for consulting the collection, not for study.","address":"Calle Santos Zárate 13, 04004 Almería","lat":36.84177,"lng":-2.45909,"website":"https://www.bibliotecaspublicas.es/almeria/","phone":"+34 950 565 071","opening_hours":"Mo-Su 08:00-24:00","hours_source":"website","access":"open","access_note":"Free, no booking. Study rooms 08:00-24:00 daily (closed 25 and 31 December and 6 January); 24 h in exam periods. Wi-Fi: join network BIBLIOTECA and follow the sign-up steps; access lasts six months."},
{"slug":"biblioteca-publica-provincial-francisco-villaespesa-almeria","city":"almeria","name":"Biblioteca Provincial Francisco Villaespesa","category":"library","description":"Provincial public library on Calle Hermanos Machado, run by the Junta de Andalucía. Since the 2024 reorganisation the whole second floor is a study room with electrified tables and 186 study places, with the collection on the first floor. Open Wi-Fi is reported by press and visitors, though the library's own page does not list it. Winter hours are weekdays 09:00-21:00 and Saturday mornings.","address":"Calle Hermanos Machado s/n, 04004 Almería","lat":36.83591,"lng":-2.46055,"website":"https://www.juntadeandalucia.es/cultura/agendaculturaldeandalucia/evento/biblioteca-publica-del-estado-biblioteca-provincial-de-almeria-francisco-villaespesa","phone":"+34 950 10 11 67","opening_hours":"Mo-Fr 09:00-21:00; Sa 09:00-14:00","hours_source":"website","access":"open","access_note":"Free. 1 Sept-30 June: Mo-Fr 09:00-21:00, Sa 09:00-14:00. 1 July-31 Aug: Mo-Fr 09:00-14:00, closed Saturday. Closed Sundays."}
]$items$::jsonb) as x(
      slug text, city text, name text, category text, description text, address text,
      lat double precision, lng double precision, website text, phone text, opening_hours text,
      hours_source text, day_pass_price_cents integer, wheelchair text, outdoor_seating text,
      access text, access_note text, address_unconfirmed boolean
    )
  loop
    select id into v_city from public.cities where slug = it.city;
    if v_city is null then
      continue;
    end if;

    v_id := null;
    v_osm := false;
    select id, (source = 'osm') into v_id, v_osm from public.places where slug = it.slug and category = it.category;
    v_osm := coalesce(v_osm, false);
    if v_id is null then
      select p.id into v_id
        from public.places p
       where p.category = it.category
         and p.source = 'osm'
         and p.status <> 'archived'
         and not (p.id = any(v_matched))
         and public.approx_distance_km(p.lat, p.lng, it.lat, it.lng) < 0.2
         and (
           public.approx_distance_km(p.lat, p.lng, it.lat, it.lng) < 0.015
           or (p.category = 'library' and public.approx_distance_km(p.lat, p.lng, it.lat, it.lng) < 0.06)
           or pg_temp.almeria_nk(p.name) like '%' || pg_temp.almeria_nk(it.name) || '%'
           or pg_temp.almeria_nk(it.name) like '%' || pg_temp.almeria_nk(p.name) || '%'
         )
       order by public.approx_distance_km(p.lat, p.lng, it.lat, it.lng)
       limit 1;
      v_osm := v_id is not null;
    end if;

    if v_id is null then
      insert into public.places (
        city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
        opening_hours, hours_source, day_pass_price_cents, wheelchair, outdoor_seating, access, access_note,
        address_unconfirmed, last_verified_at
      ) values (
        v_city, it.slug, it.name, it.category, 'published', 'admin', it.description, it.address, it.lat, it.lng,
        it.website, it.phone, it.opening_hours, it.hours_source, it.day_pass_price_cents,
        coalesce(it.wheelchair, 'unknown'), coalesce(it.outdoor_seating, 'unknown'), it.access, it.access_note,
        coalesce(it.address_unconfirmed, false), date '2026-11-15'
      );
    elsif v_osm then
      v_matched := array_append(v_matched, v_id);
      v_lock := array['name', 'lat', 'lng'];
      if it.address is not null then v_lock := array_append(v_lock, 'address'); end if;
      if it.website is not null then v_lock := array_append(v_lock, 'website'); end if;
      if it.phone is not null then v_lock := array_append(v_lock, 'phone'); end if;
      if it.opening_hours is not null then v_lock := array_append(v_lock, 'opening_hours'); end if;
      if it.wheelchair is not null and it.wheelchair <> 'unknown' then v_lock := array_append(v_lock, 'wheelchair'); end if;
      if it.outdoor_seating is not null and it.outdoor_seating <> 'unknown' then v_lock := array_append(v_lock, 'outdoor_seating'); end if;
      update public.places set
        city_id = v_city,
        name = it.name,
        description = it.description,
        address = coalesce(it.address, address),
        lat = it.lat,
        lng = it.lng,
        website = coalesce(it.website, website),
        phone = coalesce(it.phone, phone),
        opening_hours = coalesce(it.opening_hours, opening_hours),
        hours_source = case when it.opening_hours is not null then it.hours_source else hours_source end,
        day_pass_price_cents = coalesce(it.day_pass_price_cents, day_pass_price_cents),
        wheelchair = case when it.wheelchair is not null and it.wheelchair <> 'unknown' then it.wheelchair else wheelchair end,
        outdoor_seating = case when it.outdoor_seating is not null and it.outdoor_seating <> 'unknown' then it.outdoor_seating else outdoor_seating end,
        access = it.access,
        access_note = it.access_note,
        address_unconfirmed = coalesce(it.address_unconfirmed, false),
        status = case when status = 'needs_review' then 'published' else status end,
        last_verified_at = date '2026-11-15',
        locked_fields = (select coalesce(array_agg(distinct f), '{}') from unnest(locked_fields || v_lock) f)
      where id = v_id;
    else
      update public.places set
        name = it.name,
        description = it.description,
        address = it.address,
        lat = it.lat,
        lng = it.lng,
        website = it.website,
        phone = it.phone,
        opening_hours = it.opening_hours,
        hours_source = it.hours_source,
        day_pass_price_cents = it.day_pass_price_cents,
        wheelchair = coalesce(it.wheelchair, 'unknown'),
        outdoor_seating = coalesce(it.outdoor_seating, 'unknown'),
        access = it.access,
        access_note = it.access_note,
        address_unconfirmed = coalesce(it.address_unconfirmed, false),
        last_verified_at = date '2026-11-15'
      where id = v_id and source = 'admin';
    end if;
  end loop;
  perform set_config('cosurfing.bulk', 'off', true);

  for v_city in select id from public.cities where slug = 'almeria' loop
    perform public.refresh_city_stats(v_city);
  end loop;
end
$almeria$;

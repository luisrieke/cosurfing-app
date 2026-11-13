-- ZBW Kiel was imported from OSM with the library default access = 'open'. In fact, using the
-- reading room needs a free ZBW card (formal admission, ID required). The card is issued at the
-- service desk on the spot, or you can register online first; it does not take days.
-- Hours corrected to the ZBW website (OSM had Tu,We,Fr 10:00-16:30).
-- Source: https://www.zbw.eu/de/faq, https://www.zbw.eu/de/services/bibliothek/lernort-kiel (checked 2026-11-13).

update public.places
   set access = 'registration',
       access_note = 'Free ZBW card required (valid ID needed). Get it at the service desk in Kiel, or register online first. Card is issued at the desk.',
       opening_hours = 'Mo,Th 10:00-18:00; Tu,We,Fr 08:30-16:00',
       hours_source = 'website',
       website = coalesce(website, 'https://www.zbw.eu'),
       last_verified_at = date '2026-11-13'
 where slug = 'zbw-leibniz-informationszentrum-wirtschaft-kiel'
   and source = 'osm';

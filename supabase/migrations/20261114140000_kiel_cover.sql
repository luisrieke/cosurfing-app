-- Own photo of the Kiel fjord with the German Naval Yards cranes, served from public/covers.
update public.cities
   set cover_url = '/covers/kiel.jpg',
       cover_thumb_url = '/covers/kiel.jpg',
       cover_attribution = null,
       cover_source_url = null
 where slug = 'kiel';

-- The map loads published places inside the visible area (lat/lng range filter).
create index if not exists places_published_lat_lng_idx
  on public.places (lat, lng)
  where status = 'published';

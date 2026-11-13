-- Work score: reviews weigh clearly more than Wi-Fi speed.
-- Weights were reviews 55 / Wi-Fi 20 / outlets & calls 10 / info 10 / type 5; now
-- reviews 65 / Wi-Fi 10 / outlets & calls 10 / info 10 / type 5.
-- Wi-Fi scales from 0 to 10 across the whole range while the review part is pulled toward the
-- middle, so at 20% a fast connection could outweigh what members actually think of a place.

create or replace function public.compute_place_score(p public.places, s public.place_rating_stats)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_prior constant numeric := 3;
  m_prior constant numeric := 3.5;
  n numeric := coalesce(p.review_count, 0);
  avg_rating numeric := coalesce(p.rating_avg, m_prior);
  bayes numeric;
  rev numeric;
  wifi numeric;
  power numeric;
  calls numeric;
  facts numeric;
  completeness numeric;
  cat numeric;
  has_price boolean;
  total numeric;
begin
  bayes := (c_prior * m_prior + n * avg_rating) / (c_prior + n);
  rev := greatest(0, least(1, (bayes - 1) / 4));

  if p.download_median_mbps is not null then
    wifi := least(1, ln(1 + p.download_median_mbps) / ln(101));
  elsif s.wifi_avg is not null then
    wifi := (s.wifi_avg - 1) / 4;
  elsif p.wifi_community is not null then
    wifi := case p.wifi_community when 'yes' then 0.5 when 'unreliable' then 0.2 else 0 end;
  elsif p.wifi = 'yes' then
    wifi := 0.5;
  elsif p.wifi = 'no' then
    wifi := 0;
  else
    wifi := 0.25;
  end if;
  -- A fast test on a good moment does not make Wi-Fi that keeps dropping out reliable.
  if p.wifi_community = 'unreliable' then
    wifi := least(wifi, 0.4);
  end if;

  if s.power_avg is not null then
    power := (s.power_avg - 1) / 4;
  else
    power := case p.power_outlets when 'plenty' then 1 when 'some' then 0.6 when 'none' then 0 else 0.3 end;
  end if;

  if s.calls_answers is not null and s.calls_answers > 0 then
    calls := s.calls_ok_count::numeric / s.calls_answers;
  else
    calls := case p.calls when 'yes' then 1 when 'limited' then 0.5 when 'no' then 0 else 0.3 end;
  end if;
  facts := (power + calls) / 2;

  has_price := p.day_pass_price_cents is not null or p.price_level is not null
    or (p.web_facts ? 'day_pass');
  completeness := (
    (case when p.opening_hours is not null or p.hours is not null then 1 else 0 end)
    + (case when p.website is not null then 1 else 0 end)
    + (case when p.address is not null then 1 else 0 end)
    + (case when has_price then 1 else 0 end)
  )::numeric / 4;

  cat := case p.category when 'coworking' then 1 when 'library' then 0.8 when 'coliving' then 0.8 else 0.5 end;

  total := 10 * (0.65 * rev + 0.10 * wifi + 0.10 * facts + 0.10 * completeness + 0.05 * cat);

  return jsonb_build_object(
    'score', round(total, 2),
    'reviews', round(rev * 10, 1),
    'wifi', round(wifi * 10, 1),
    'facts', round(facts * 10, 1),
    'completeness', round(completeness * 10, 1),
    'category', round(cat * 10, 1)
  );
end;
$$;

-- Recompute every place; the places_score trigger applies the new weights and the city
-- statistics trigger follows when a score changes.
update public.places set work_score = work_score;

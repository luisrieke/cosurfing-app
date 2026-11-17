-- Admin dashboard numbers for the review growth work: repeat reviewers, reviews per source and
-- whether contributor emails lead to reviews.

create or replace function public.admin_review_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with per_user as (
    select user_id, count(*) as n from public.reviews where status = 'visible' group by user_id
  )
  select jsonb_build_object(
    'days', greatest(p_days, 1),
    'reviewers', (select count(*) from per_user),
    'repeat_reviewers', (select count(*) from per_user where n >= 2),
    'reviews', (select count(*) from public.reviews where created_at >= v_since and status <> 'hidden'),
    'nudges_opt_in', (select count(*) from public.profiles where email_nudges),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.source, 'count', s.n) order by s.n desc)
        from (
          select coalesce(source, 'unknown') as source, count(*) as n
            from public.reviews
           where created_at >= v_since and status <> 'hidden'
           group by 1
        ) s
    ), '[]'::jsonb),
    'emails', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'sent', e.sent, 'reviews', e.reviews) order by e.kind)
        from (
          select c.kind,
                 count(*) as sent,
                 -- "How was X?" counts a review of that place; the others any review within 7 days.
                 count(*) filter (where exists (
                   select 1 from public.reviews r
                    where r.user_id = c.user_id
                      and r.created_at between c.sent_at and c.sent_at + interval '7 days'
                      and (c.kind <> 'visit_prompt' or r.place_id = c.place_id)
                 )) as reviews
            from public.contributor_emails c
           where c.sent_at >= v_since
           group by c.kind
        ) e
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_review_metrics(integer) from public, anon;
grant execute on function public.admin_review_metrics(integer) to authenticated;

alter function public.review_points(text) set search_path = public;

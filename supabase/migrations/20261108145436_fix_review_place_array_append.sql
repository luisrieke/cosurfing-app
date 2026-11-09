-- text[] || 'status' is parsed as array concatenation, so Postgres tries to read the
-- bare word as an array literal and raises: malformed array literal: "status".
-- array_append treats the value as one text element.
create or replace function public.review_place(p_place_id uuid, p_decision text, p_website text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_website text := nullif(trim(coalesce(p_website, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_decision not in ('exists', 'closed') then
    raise exception 'invalid decision';
  end if;
  if v_website is not null and v_website !~* '^https?://[^\s/]+\.[^\s]+$' then
    raise exception 'invalid website';
  end if;

  if p_decision = 'exists' then
    update public.places
       set status = 'published',
           review_reason = null,
           last_verified_at = current_date,
           website = coalesce(v_website, website),
           website_status = case when v_website is not null then null else website_status end,
           website_fail_count = 0,
           web_crawl_status = case when v_website is not null then 'pending' else web_crawl_status end,
           locked_fields = case
             when v_website is not null and not ('website' = any(locked_fields)) then array_append(locked_fields, 'website')
             else locked_fields end
     where id = p_place_id;
  else
    update public.places
       set status = 'archived',
           locked_fields = case
             when 'status' = any(locked_fields) then locked_fields
             else array_append(locked_fields, 'status') end
     where id = p_place_id;
  end if;

  update public.place_reports set status = 'resolved'
   where place_id = p_place_id and kind = 'closed' and status = 'open';
end;
$$;

revoke all on function public.review_place(uuid, text, text) from public, anon;
grant execute on function public.review_place(uuid, text, text) to authenticated;

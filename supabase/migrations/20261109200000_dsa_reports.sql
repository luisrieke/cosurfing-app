-- Notice and action under the Digital Services Act (Art. 16 and 17):
-- anyone can report a review, photo, menu, offer, Wi-Fi tip or profile; every admin decision that
-- removes or restricts someone's content queues a statement of reasons, and reporters get a
-- confirmation of receipt and the decision. The `moderation-notices` edge function sends the queue.

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('review', 'photo', 'menu', 'offer', 'wifi_note', 'profile')),
  target_id uuid not null,
  place_id uuid references public.places (id) on delete set null,
  reporter_id uuid references auth.users (id) on delete set null,
  reporter_email text check (reporter_email is null or (char_length(reporter_email) <= 254 and reporter_email like '%_@_%')),
  reason text not null check (reason in ('illegal', 'personal_data', 'copyright', 'spam', 'offensive', 'inaccurate', 'other')),
  body text not null check (char_length(body) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'removed', 'kept')),
  decision_reason text,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index content_reports_status_idx on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

create policy "admins read content reports" on public.content_reports
  for select to authenticated using ((select public.is_admin()));

create table public.moderation_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('decision', 'report_received', 'report_result')),
  user_id uuid references auth.users (id) on delete cascade,
  email text,
  target_type text not null,
  place_id uuid references public.places (id) on delete set null,
  summary text,
  action text,
  reason text,
  note text,
  report_id uuid references public.content_reports (id) on delete set null,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint moderation_notices_recipient check (user_id is not null or email is not null)
);

create index moderation_notices_unsent_idx on public.moderation_notices (created_at) where sent_at is null;

-- Service role only; admins may read the log.
alter table public.moderation_notices enable row level security;

create policy "admins read moderation notices" on public.moderation_notices
  for select to authenticated using ((select public.is_admin()));

create or replace function public.moderation_reason_valid(p_reason text)
returns boolean
language sql
immutable
as $$
  select p_reason in ('rules', 'illegal', 'personal_data', 'copyright', 'spam', 'offensive', 'inaccurate', 'duplicate');
$$;

-- Queues a statement of reasons when an admin hides, rejects or deletes someone else's content.
-- The reason comes from the transaction setting cosurfing.moderation_reason (see the wrappers below).
create or replace function public.moderation_notice_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_user uuid;
  v_place uuid;
  v_action text;
  v_reason text;
begin
  if not public.is_admin() then
    return null;
  end if;
  v_user := coalesce(r ->> 'user_id', r ->> 'uploaded_by')::uuid;
  if v_user is null or v_user = auth.uid() then
    return null;
  end if;
  v_place := nullif(r ->> 'place_id', '')::uuid;

  if tg_op = 'DELETE' then
    -- Already notified when it was hidden or rejected; cascades from a deleted place are not about the content.
    if (r ->> 'status') in ('hidden', 'rejected') then
      return null;
    end if;
    if v_place is not null and not exists (select 1 from public.places where id = v_place) then
      return null;
    end if;
    v_action := 'deleted';
  elsif (r ->> 'status') in ('hidden', 'rejected') and (o ->> 'status') is distinct from (r ->> 'status') then
    v_action := case when (o ->> 'status') = 'pending' then 'not_published' else 'hidden' end;
  elsif (r ->> 'edit_status') = 'rejected' and (o ->> 'edit_status') is distinct from 'rejected' then
    v_action := 'edit_rejected';
  else
    return null;
  end if;

  v_reason := nullif(current_setting('cosurfing.moderation_reason', true), '');
  if v_reason is null or not public.moderation_reason_valid(v_reason) then
    v_reason := 'rules';
  end if;

  insert into public.moderation_notices (kind, user_id, target_type, place_id, summary, action, reason)
  values (
    'decision',
    v_user,
    tg_argv[0],
    v_place,
    left(coalesce(r ->> 'body', r ->> 'title', r ->> 'name', r ->> 'note', r ->> 'key'), 200),
    v_action,
    v_reason
  );
  return null;
end;
$$;

revoke all on function public.moderation_notice_trigger() from public, anon, authenticated;

create trigger reviews_moderation_notice after update or delete on public.reviews
  for each row execute function public.moderation_notice_trigger('review');
create trigger place_photos_moderation_notice after update or delete on public.place_photos
  for each row execute function public.moderation_notice_trigger('photo');
create trigger place_menus_moderation_notice after update or delete on public.place_menus
  for each row execute function public.moderation_notice_trigger('menu');
create trigger place_offers_moderation_notice after update or delete on public.place_offers
  for each row execute function public.moderation_notice_trigger('offer');
create trigger place_wifi_notes_moderation_notice after delete on public.place_wifi_notes
  for each row execute function public.moderation_notice_trigger('wifi_note');
create trigger place_facts_moderation_notice after update on public.place_facts
  for each row execute function public.moderation_notice_trigger('fact');
create trigger place_suggestions_moderation_notice after update on public.place_suggestions
  for each row execute function public.moderation_notice_trigger('suggestion');
create trigger speed_tests_moderation_notice after update or delete on public.speed_tests
  for each row execute function public.moderation_notice_trigger('speed_test');

-- Same as moderate_contribution, with the reason that goes into the statement of reasons.
create or replace function public.moderate_contribution_with_reason(
  p_reason text,
  p_kind text,
  p_decision text,
  p_id uuid default null,
  p_place_id uuid default null,
  p_user_id uuid default null,
  p_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if not public.moderation_reason_valid(p_reason) then
    raise exception 'invalid reason';
  end if;
  perform set_config('cosurfing.moderation_reason', p_reason, true);
  perform public.moderate_contribution(p_kind, p_decision, p_id, p_place_id, p_user_id, p_key);
end;
$$;

create or replace function public.admin_set_review_status(p_id uuid, p_status text, p_reason text default 'rules')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_status not in ('visible', 'hidden') or not public.moderation_reason_valid(p_reason) then
    raise exception 'invalid input';
  end if;
  perform set_config('cosurfing.moderation_reason', p_reason, true);
  update public.reviews set status = p_status where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting (anyone; signed-out reporters must leave an email address)
-- ---------------------------------------------------------------------------

create or replace function public.submit_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_body text,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_place uuid;
  v_exists boolean;
  v_id uuid;
begin
  if v_uid is null and v_email is null then
    raise exception 'email_required' using errcode = 'P0001';
  end if;
  if not public.consume_rate_limit('content_report:' || coalesce(v_uid::text, v_email), 10, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  case p_target_type
    when 'review' then select true, place_id into v_exists, v_place from public.reviews where id = p_target_id;
    when 'photo' then select true, place_id into v_exists, v_place from public.place_photos where id = p_target_id;
    when 'menu' then select true, place_id into v_exists, v_place from public.place_menus where id = p_target_id;
    when 'offer' then select true, place_id into v_exists, v_place from public.place_offers where id = p_target_id;
    when 'wifi_note' then select true, place_id into v_exists, v_place from public.place_wifi_notes where id = p_target_id;
    when 'profile' then select true into v_exists from public.profiles where id = p_target_id;
    else raise exception 'invalid_target' using errcode = 'P0001';
  end case;
  if not coalesce(v_exists, false) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into public.content_reports (target_type, target_id, place_id, reporter_id, reporter_email, reason, body)
  values (p_target_type, p_target_id, v_place, v_uid, case when v_uid is null then v_email end, p_reason, trim(p_body))
  returning id into v_id;

  insert into public.moderation_notices (kind, user_id, email, target_type, place_id, report_id)
  values ('report_received', v_uid, case when v_uid is null then v_email end, p_target_type, v_place, v_id);

  return v_id;
end;
$$;

revoke all on function public.submit_content_report(text, uuid, text, text, text) from public;
grant execute on function public.submit_content_report(text, uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: list and decide
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_content_reports()
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  reason text,
  body text,
  status text,
  decision_reason text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz,
  reporter_is_user boolean,
  place_name text,
  place_slug text,
  author_id uuid,
  author_name text,
  content_text text,
  content_image text,
  content_exists boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
  select r.id, r.target_type, r.target_id, r.reason, r.body, r.status, r.decision_reason, r.decision_note,
         r.decided_at, r.created_at, r.reporter_id is not null,
         p.name, p.slug,
         t.author_id, pr.display_name, t.content_text, t.content_image, t.author_id is not null
    from public.content_reports r
    left join public.places p on p.id = r.place_id
    left join lateral (
      select rv.user_id as author_id, rv.body as content_text, null::text as content_image
        from public.reviews rv where r.target_type = 'review' and rv.id = r.target_id
      union all
      select ph.uploaded_by, null, ph.preview_path
        from public.place_photos ph where r.target_type = 'photo' and ph.id = r.target_id
      union all
      select m.user_id, null, m.path
        from public.place_menus m where r.target_type = 'menu' and m.id = r.target_id
      union all
      select o.user_id, concat_ws(' · ', o.title, o.details, o.url, o.code), null
        from public.place_offers o where r.target_type = 'offer' and o.id = r.target_id
      union all
      select w.user_id, w.body, null
        from public.place_wifi_notes w where r.target_type = 'wifi_note' and w.id = r.target_id
      union all
      select pf.id, pf.display_name, pf.avatar_path
        from public.profiles pf where r.target_type = 'profile' and pf.id = r.target_id
      limit 1
    ) t on true
    left join public.profiles pr on pr.id = t.author_id
   order by (r.status = 'open') desc, r.created_at desc
   limit 300;
end;
$$;

create or replace function public.admin_decide_content_report(
  p_report_id uuid,
  p_decision text,
  p_reason text default 'rules',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.content_reports;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_decision not in ('remove', 'keep') or not public.moderation_reason_valid(p_reason) then
    raise exception 'invalid input';
  end if;
  select * into r from public.content_reports where id = p_report_id for update;
  if r.id is null then
    raise exception 'not found';
  end if;

  perform set_config('cosurfing.moderation_reason', p_reason, true);

  if p_decision = 'remove' then
    case r.target_type
      when 'review' then update public.reviews set status = 'hidden' where id = r.target_id;
      when 'photo' then update public.place_photos set status = 'rejected', rejected_reason = p_reason where id = r.target_id;
      when 'menu' then update public.place_menus set status = 'rejected' where id = r.target_id;
      when 'offer' then update public.place_offers set status = 'rejected' where id = r.target_id;
      when 'wifi_note' then delete from public.place_wifi_notes where id = r.target_id;
      when 'profile' then
        update public.profiles set display_name = null, avatar_path = null where id = r.target_id;
        insert into public.moderation_notices (kind, user_id, target_type, summary, action, reason, note, report_id)
        values ('decision', r.target_id, 'profile', null, 'profile_reset', p_reason, v_note, r.id);
    end case;
    -- Attach the admin's note to the statement of reasons the triggers just queued.
    update public.moderation_notices
       set note = coalesce(note, v_note), report_id = coalesce(report_id, r.id)
     where kind = 'decision' and sent_at is null and created_at = now();
  end if;

  update public.content_reports
     set status = case when p_decision = 'remove' then 'removed' else 'kept' end,
         decision_reason = p_reason,
         decision_note = v_note,
         decided_at = now()
   where id = r.id;

  if r.reporter_id is not null or r.reporter_email is not null then
    insert into public.moderation_notices (kind, user_id, email, target_type, place_id, action, reason, note, report_id)
    values ('report_result', r.reporter_id, r.reporter_email, r.target_type, r.place_id,
            case when p_decision = 'remove' then 'removed' else 'kept' end, p_reason, v_note, r.id);
  end if;
end;
$$;

-- Send queued notices every 5 minutes when there are any.
select cron.schedule(
  'cosurfing-moderation-notices',
  '*/5 * * * *',
  $$select public.invoke_crawler('moderation-notices')
     where exists (select 1 from public.moderation_notices where sent_at is null and attempts < 5)$$
);

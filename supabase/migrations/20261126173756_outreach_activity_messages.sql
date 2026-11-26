-- Outreach via chat (Slack, WhatsApp, ...): message_out / message_in, channel in provider.
alter table public.place_outreach_activities drop constraint if exists place_outreach_activities_kind_check;
alter table public.place_outreach_activities add constraint place_outreach_activities_kind_check
  check (kind in ('email_out', 'email_in', 'message_out', 'message_in', 'call', 'visit', 'note'));

create or replace function public.place_outreach_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('email_out', 'email_in', 'message_out', 'message_in', 'call', 'visit') then
    insert into public.place_outreach (place_id, last_contacted_at)
    values (new.place_id, new.occurred_at)
    on conflict (place_id) do update
      set last_contacted_at = greatest(coalesce(public.place_outreach.last_contacted_at, excluded.last_contacted_at), excluded.last_contacted_at);
  end if;
  return new;
end;
$$;

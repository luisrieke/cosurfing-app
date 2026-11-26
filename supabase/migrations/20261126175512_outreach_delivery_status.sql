-- Delivery status of outreach emails, reported by the Resend webhook (supabase/functions/resend-webhook).
-- The email_out activity sent through Resend carries the Resend email id in provider_message_id; the
-- webhook looks it up there and records delivered / delayed / bounced / complained / failed.
-- A permanent bounce moves the place to the new 'bounced' stage, so it shows up as "find a working
-- contact" instead of quietly turning into "no response".

alter table public.place_outreach drop constraint if exists place_outreach_stage_check;
alter table public.place_outreach add constraint place_outreach_stage_check
  check (stage in ('to_contact', 'emailed', 'replied', 'confirmed', 'no_response', 'bounced'));

alter table public.place_outreach_activities
  add column if not exists delivery_status text
    check (delivery_status in ('delivered', 'delivery_delayed', 'bounced', 'complained', 'failed')),
  add column if not exists delivery_detail text,
  add column if not exists delivery_updated_at timestamptz;

create index if not exists place_outreach_activities_provider_message_idx
  on public.place_outreach_activities (provider, provider_message_id)
  where provider_message_id is not null;

-- Called by the webhook with the service role only. Returns the number of activities it matched
-- (0 for emails that are not outreach, such as sign-in codes).
create or replace function public.record_outreach_delivery(
  p_provider text,
  p_message_id text,
  p_status text,
  p_detail text default null,
  p_permanent boolean default false,
  p_occurred_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank constant jsonb := '{"delivery_delayed": 1, "delivered": 2, "bounced": 3, "complained": 3, "failed": 3}';
  v_activity record;
  v_count integer := 0;
begin
  if p_status not in ('delivered', 'delivery_delayed', 'bounced', 'complained', 'failed') then
    raise exception 'unknown delivery status %', p_status;
  end if;

  for v_activity in
    select id, place_id, delivery_status
      from public.place_outreach_activities
     where provider = p_provider and provider_message_id = p_message_id and kind = 'email_out'
       for update
  loop
    v_count := v_count + 1;
    -- Events can arrive out of order: never let a late "delivered" overwrite a bounce.
    if v_activity.delivery_status is null
       or (v_rank ->> p_status)::int >= (v_rank ->> v_activity.delivery_status)::int then
      update public.place_outreach_activities
         set delivery_status = p_status,
             delivery_detail = coalesce(p_detail, delivery_detail),
             delivery_updated_at = p_occurred_at
       where id = v_activity.id;
    end if;

    -- Only a hard bounce or a failed send means the address is unusable. A reply or confirmation
    -- that already came in through another channel stays as it is.
    if (p_status = 'bounced' and p_permanent) or p_status = 'failed' then
      insert into public.place_outreach (place_id, stage)
      values (v_activity.place_id, 'bounced')
      on conflict (place_id) do update
        set stage = 'bounced'
        where public.place_outreach.stage in ('to_contact', 'emailed', 'no_response');
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.record_outreach_delivery(text, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.record_outreach_delivery(text, text, text, text, boolean, timestamptz) to service_role;

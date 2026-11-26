-- Which service sent or received an outreach email (gmail, resend) and its message id there.
alter table public.place_outreach_activities
  add column if not exists provider text,
  add column if not exists provider_message_id text;

update public.place_outreach_activities
   set provider = 'gmail', provider_message_id = gmail_message_id
 where provider is null and gmail_message_id is not null;

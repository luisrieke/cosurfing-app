-- Admin todo list for follow-ups that a cloud/mobile Cursor agent could not finish on its own
-- (dashboard settings, secrets, CLI logins, ...). Every task stores the prompt to paste into
-- Cursor Desktop, or the exact manual steps, so it can be solved later without extra context.

create table public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'needs_desktop'
    check (category in ('needs_desktop', 'manual')),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  prompt text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index admin_tasks_status_idx on public.admin_tasks (status, created_at desc);

alter table public.admin_tasks enable row level security;

create policy "admins manage admin tasks" on public.admin_tasks
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into public.admin_tasks (category, title, description, prompt)
values (
  'needs_desktop',
  'Auth email subject says "link" instead of "code"',
  'The sign-in email body says "Your Cosurfing sign-in code" but the subject says "Your sign-in link". The subject is part of the Supabase Auth email template, which the cloud agent could not change (no Supabase access token, MCP has no auth-config tool).',
  E'In the Supabase project "cosurfing" (ref xijiyqstanafqjmfllsm), change the Auth email subjects so they say "code" instead of "link".\n\nUse the Management API with a personal access token (https://supabase.com/dashboard/account/tokens) exported as SUPABASE_ACCESS_TOKEN:\n\ncurl -X PATCH "https://api.supabase.com/v1/projects/xijiyqstanafqjmfllsm/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d ''{"mailer_subjects_magic_link":"Your Cosurfing sign-in code","mailer_subjects_confirmation":"Your Cosurfing sign-in code"}''\n\nThen request a new sign-in code in the app and verify the subject reads "Your Cosurfing sign-in code".\n\nManual alternative: Supabase dashboard > Authentication > Email Templates > Magic Link (and Confirm signup) > Subject = "Your Cosurfing sign-in code".'
);

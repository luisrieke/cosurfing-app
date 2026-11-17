-- Remember when the "Copy prompt" button was last clicked so the admin can see which tasks
-- are already being worked on.
alter table public.admin_tasks add column copied_at timestamptz;

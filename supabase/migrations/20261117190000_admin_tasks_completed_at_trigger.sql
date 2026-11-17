-- Always remember when an admin task was closed, no matter who closes it (admin UI, an agent via
-- SQL, a manual update). Reopening a task clears the timestamp again.

create or replace function public.admin_tasks_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' or new.completed_at is null then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger admin_tasks_set_completed_at
  before insert or update on public.admin_tasks
  for each row execute function public.admin_tasks_set_completed_at();

-- Backfill tasks that were closed before this was enforced (best available approximation).
update public.admin_tasks
set completed_at = coalesce(copied_at, created_at)
where status = 'done' and completed_at is null;

create index if not exists admin_tasks_completed_at_idx on public.admin_tasks (completed_at desc) where status = 'done';

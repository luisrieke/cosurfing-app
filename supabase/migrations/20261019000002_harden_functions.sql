-- Tighten function privileges flagged by the Supabase security advisor.
-- is_admin(), is_plus(), get_place_photos() and get_place_reviews() stay executable by anon/authenticated
-- on purpose: RLS policies call the first two and public place pages call the last two.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger functions are never called directly by clients.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.refresh_place_rating() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Admin-only RPC: signed-in users may call it, the function itself checks is_admin().
revoke all on function public.approve_suggestion(uuid, text, double precision, double precision) from public, anon;

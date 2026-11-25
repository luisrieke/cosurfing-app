-- Owner checks are only used by signed-in users (policies to authenticated, owner RPCs).
revoke execute on function public.is_place_owner(uuid) from anon;
revoke execute on function public.owns_place_folder(text) from anon;

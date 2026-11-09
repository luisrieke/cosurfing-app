-- Admin moderation RPCs are for signed-in admins only (they also check is_admin() themselves).

alter function public.moderation_reason_valid(text) set search_path = public;

revoke execute on function public.admin_decide_content_report(uuid, text, text, text) from public, anon;
revoke execute on function public.admin_get_content_reports() from public, anon;
revoke execute on function public.admin_set_review_status(uuid, text, text) from public, anon;
revoke execute on function public.moderate_contribution_with_reason(text, text, text, uuid, uuid, uuid, text) from public, anon;

grant execute on function public.admin_decide_content_report(uuid, text, text, text) to authenticated;
grant execute on function public.admin_get_content_reports() to authenticated;
grant execute on function public.admin_set_review_status(uuid, text, text) to authenticated;
grant execute on function public.moderate_contribution_with_reason(text, text, text, uuid, uuid, uuid, text) to authenticated;

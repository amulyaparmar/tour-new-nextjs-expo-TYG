create or replace function public.append_session_check_in(
  p_session_id uuid,
  p_lead jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.sessions
  set leads = coalesce(leads, '[]'::jsonb) || jsonb_build_array(p_lead)
  where id = p_session_id;
$$;

revoke all on function public.append_session_check_in(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_session_check_in(uuid, jsonb) to service_role;

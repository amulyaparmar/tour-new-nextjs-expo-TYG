create or replace function public.save_analysis_run(
  p_session_id uuid,
  p_result_json jsonb,
  p_rubric_id uuid default null,
  p_rubric_name text default null,
  p_trigger text default null
)
returns table(run_id uuid, version int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_next_version int;
  v_trigger text;
  v_overall_score numeric;
begin
  if p_trigger is not null and p_trigger not in ('initial', 'reanalyze') then
    raise exception 'Invalid analysis trigger: %', p_trigger;
  end if;

  perform 1
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Session not found: %', p_session_id;
  end if;

  select coalesce(max(a.version), 0) + 1
  into v_next_version
  from public.analyses a
  where a.session_id = p_session_id;

  v_trigger := coalesce(
    p_trigger,
    case when v_next_version > 1 then 'reanalyze' else 'initial' end
  );

  update public.analyses
  set is_current = false
  where session_id = p_session_id
    and is_current = true;

  insert into public.analyses (
    session_id,
    version,
    is_current,
    status,
    result_json,
    rubric_id,
    rubric_name,
    trigger
  )
  values (
    p_session_id,
    v_next_version,
    true,
    'ready',
    p_result_json,
    p_rubric_id,
    p_rubric_name,
    v_trigger
  )
  returning id into v_run_id;

  v_overall_score := nullif(p_result_json->>'overallScore', '')::numeric;

  update public.sessions
  set
    status = 'analysis_ready',
    overall_score = v_overall_score
  where id = p_session_id;

  return query select v_run_id, v_next_version;
end;
$$;

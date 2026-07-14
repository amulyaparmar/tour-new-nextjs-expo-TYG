-- Denormalize pipeline card copy onto sessions for fast list renders.
alter table public.sessions
  add column if not exists card_summary text,
  add column if not exists needs_improvement text;

comment on column public.sessions.card_summary is
  'Exactly ~9 word performance blurb authored by analysis pipeline.';
comment on column public.sessions.needs_improvement is
  'Single coaching improvement line authored by analysis pipeline.';

-- Backfill from current analysis runs (use dedicated fields when present).
update public.sessions s
set
  card_summary = coalesce(
    nullif(trim(a.result_json->>'cardSummary'), ''),
    nullif(
      array_to_string(
        (string_to_array(trim(coalesce(a.result_json->>'summary', '')), ' '))[1:9],
        ' '
      ),
      ''
    )
  ),
  needs_improvement = coalesce(
    nullif(trim(a.result_json->>'needsImprovement'), ''),
    nullif(trim(a.result_json->'opportunities'->>0), ''),
    nullif(trim(a.result_json->'exactMoments'->0->>'suggestedImprovement'), '')
  )
from public.analyses a
where a.session_id = s.id
  and a.is_current = true
  and (
    s.card_summary is null
    or s.needs_improvement is null
  );

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
  v_card_summary text;
  v_needs_improvement text;
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
  v_card_summary := nullif(trim(p_result_json->>'cardSummary'), '');
  if v_card_summary is null then
    v_card_summary := nullif(
      array_to_string(
        (string_to_array(trim(coalesce(p_result_json->>'summary', '')), ' '))[1:9],
        ' '
      ),
      ''
    );
  end if;
  v_needs_improvement := coalesce(
    nullif(trim(p_result_json->>'needsImprovement'), ''),
    nullif(trim(p_result_json->'opportunities'->>0), ''),
    nullif(trim(p_result_json->'exactMoments'->0->>'suggestedImprovement'), '')
  );

  update public.sessions
  set
    status = 'analysis_ready',
    overall_score = v_overall_score,
    card_summary = v_card_summary,
    needs_improvement = v_needs_improvement
  where id = p_session_id;

  return query select v_run_id, v_next_version;
end;
$$;

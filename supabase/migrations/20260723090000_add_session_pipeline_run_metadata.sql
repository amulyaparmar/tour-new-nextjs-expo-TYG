-- Track workflow orchestration metadata directly on sessions so the UI and
-- support tooling can distinguish running, completed, stale, and failed jobs.
alter table public.sessions
  add column if not exists analysis_workflow_run_id text,
  add column if not exists analysis_workflow_started_at timestamptz,
  add column if not exists analysis_workflow_completed_at timestamptz,
  add column if not exists analysis_workflow_error text,
  add column if not exists analysis_workflow_attempts int not null default 0,
  add column if not exists audio_insights_workflow_run_id text,
  add column if not exists audio_insights_started_at timestamptz,
  add column if not exists audio_insights_completed_at timestamptz,
  add column if not exists audio_insights_error text,
  add column if not exists audio_insights_attempts int not null default 0;

create index if not exists sessions_analysis_workflow_run_id_idx
  on public.sessions (analysis_workflow_run_id)
  where analysis_workflow_run_id is not null;

create index if not exists sessions_audio_insights_workflow_run_id_idx
  on public.sessions (audio_insights_workflow_run_id)
  where audio_insights_workflow_run_id is not null;

comment on column public.sessions.analysis_workflow_run_id is
  'Workflow run id for the latest main LLM session analysis / re-analysis job.';
comment on column public.sessions.analysis_workflow_started_at is
  'When the latest main LLM analysis workflow was started.';
comment on column public.sessions.analysis_workflow_completed_at is
  'When the latest main LLM analysis workflow reached a terminal successful state.';
comment on column public.sessions.analysis_workflow_error is
  'Last terminal or start error from the main LLM analysis workflow.';
comment on column public.sessions.analysis_workflow_attempts is
  'Number of main LLM analysis workflow starts recorded for this session.';

comment on column public.sessions.audio_insights_workflow_run_id is
  'Workflow run id for the latest Gemini audio insights job.';
comment on column public.sessions.audio_insights_started_at is
  'When the latest audio insights workflow was started.';
comment on column public.sessions.audio_insights_completed_at is
  'When the latest audio insights workflow reached a terminal successful state.';
comment on column public.sessions.audio_insights_error is
  'Last terminal or start error from the audio insights workflow.';
comment on column public.sessions.audio_insights_attempts is
  'Number of audio insights workflow starts recorded for this session.';

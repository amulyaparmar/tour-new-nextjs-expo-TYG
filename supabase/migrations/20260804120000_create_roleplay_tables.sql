-- AI Roleplay Training (ported from usevoice.ai-TYG): voice practice attempts
-- and scenario definitions.
--
-- Why a dedicated table instead of sessions/analyses (evaluated first):
-- roleplay scorecards carry a format (waypoints, checkpoint evidence quotes,
-- timestamped feedback moments) that the sessions detail page and rubric
-- analyses cannot render, and rows in `sessions` would surface in the tour
-- lists with a broken detail view. agent_id / property_id deliberately mirror
-- sessions' conventions: text columns, property_id = communities.propertyTygId,
-- agent_id = 'user:<auth uuid>' free-form (like sessions.agent_id after
-- 20260714001333_remove_sessions_agent_foreign_key).

-- Scenarios are PROPERTY-SCOPED (like materials and rubrics): composite key so
-- the per-property seed scenarios can reuse stable ids.
create table if not exists public.roleplay_scenarios (
  property_id text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, id)
);

create index if not exists roleplay_scenarios_property_updated_idx
  on public.roleplay_scenarios (property_id, updated_at desc);

create table if not exists public.roleplay_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_id text,
  agent_name text,
  property_id text,
  scenario_id text,
  scenario_name text,
  scenario_difficulty text,
  vapi_call_id text not null unique,
  score numeric(5,2),
  grade_status text check (grade_status in ('passed', 'not-passed', 'needs-review')),
  duration_seconds integer,
  summary text,
  transcript text,
  transcript_json jsonb not null default '[]'::jsonb,
  evaluations jsonb not null default '[]'::jsonb
);

create index if not exists roleplay_attempts_property_created_idx
  on public.roleplay_attempts (property_id, created_at desc);
create index if not exists roleplay_attempts_agent_created_idx
  on public.roleplay_attempts (agent_id, created_at desc);

-- All access goes through the web app's service-role client (there is no
-- browser Supabase client in apps/web); RLS enabled with no policies keeps
-- the anon key locked out.
alter table public.roleplay_scenarios enable row level security;
alter table public.roleplay_attempts enable row level security;

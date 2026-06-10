-- Phase 1 schema for session/calendar foundation.
-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prospect_name text,
  scheduled_at timestamptz,
  location text,
  status text not null default 'scheduled' check (
    status in (
      'scheduled',
      'uploaded',
      'transcribing',
      'extracting_screenshots',
      'analyzing',
      'analysis_ready',
      'reviewed',
      'failed'
    )
  ),
  notes text,
  overall_score numeric(5,2),
  video_url text,
  audio_url text,
  duration integer,
  created_at timestamptz not null default now()
);

create index if not exists sessions_scheduled_at_idx on sessions (scheduled_at desc);
create index if not exists sessions_status_idx on sessions (status);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists analyses_session_id_key on analyses (session_id);

create table if not exists follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  title text not null,
  description text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'completed', 'dismissed')),
  suggested_message text,
  created_at timestamptz not null default now()
);

create index if not exists follow_up_actions_session_idx on follow_up_actions (session_id);

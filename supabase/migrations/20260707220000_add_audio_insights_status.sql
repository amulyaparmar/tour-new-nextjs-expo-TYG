-- Track Gemini audio insights separately from the main session processing pipeline.
alter table public.sessions
  add column if not exists audio_insights_status text not null default 'pending';

update public.sessions
set audio_insights_status = 'ready'
where audio_insights_json is not null
  and audio_insights_status = 'pending';

comment on column public.sessions.audio_insights_status is
  'Gemini audio insights workflow: pending | processing | ready | failed | unavailable';

-- ElevenLabs remains the default, while authenticated LeaseMagnets operators
-- may select another supported provider through the application.
alter table public.rubrics
  drop constraint if exists rubrics_transcribe_provider_elevenlabs_check;

alter table public.rubrics
  drop constraint if exists rubrics_transcribe_provider_allowed_check;

alter table public.rubrics
  add constraint rubrics_transcribe_provider_allowed_check
  check (
    transcribe_provider in ('whisper', 'deepgram', 'elevenlabs', 'gemini', 'aws')
  ) not valid;

alter table public.rubrics
  validate constraint rubrics_transcribe_provider_allowed_check;

comment on column public.rubrics.transcribe_provider is
  'Transcription provider for this rubric. Defaults to ElevenLabs; application changes are restricted to authenticated LeaseMagnets users.';

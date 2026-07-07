-- Per-rubric transcription provider and Gemini-only audio understanding toggle.
alter table public.rubrics
  add column if not exists transcribe_provider text not null default 'whisper',
  add column if not exists audio_understanding_enabled boolean not null default false;

comment on column public.rubrics.transcribe_provider is
  'Audio transcription provider for sessions using this rubric: whisper | deepgram | elevenlabs | gemini | aws';

comment on column public.rubrics.audio_understanding_enabled is
  'When true and transcribe_provider is gemini, run multimodal sentiment/emotion/ambience analysis';

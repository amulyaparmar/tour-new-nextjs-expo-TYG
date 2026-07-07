-- Gemini multimodal audio insights (sentiment, emotion, ambience) per session.
alter table public.sessions
  add column if not exists audio_insights_json jsonb;

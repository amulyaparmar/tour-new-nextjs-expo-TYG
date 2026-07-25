-- Provider visibility is a product/UI decision. The database validates supported
-- values and retains ElevenLabs as the default without encoding an email-domain rule.
comment on column public.rubrics.transcribe_provider is
  'Transcription provider for this rubric. Defaults to ElevenLabs; the application UI may expose other supported providers selectively.';

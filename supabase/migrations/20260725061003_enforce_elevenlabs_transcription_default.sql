-- ElevenLabs Scribe is the standard transcription stage. Gemini audio
-- understanding remains an independent, optional post-transcription workflow.
alter table public.rubrics
  alter column transcribe_provider set default 'elevenlabs';

-- Templates are normally immutable. Temporarily remove the guard so their
-- inherited transcription setting cannot route new property rubrics to Gemini.
drop trigger if exists prevent_frozen_rubric_template_changes on public.rubrics;

update public.rubrics
set transcribe_provider = 'elevenlabs'
where transcribe_provider is distinct from 'elevenlabs';

alter table public.rubrics
  drop constraint if exists rubrics_transcribe_provider_elevenlabs_check;

alter table public.rubrics
  add constraint rubrics_transcribe_provider_elevenlabs_check
  check (transcribe_provider = 'elevenlabs');

create trigger prevent_frozen_rubric_template_changes
before update or delete on public.rubrics
for each row execute function public.prevent_frozen_rubric_template_changes();

comment on column public.rubrics.transcribe_provider is
  'Compatibility field. Session transcription is standardized on ElevenLabs Scribe.';

comment on column public.rubrics.audio_understanding_enabled is
  'When true, run optional Gemini audio insights after transcription and rubric scoring.';

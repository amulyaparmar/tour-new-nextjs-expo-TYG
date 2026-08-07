-- Keep each processing decision with the rubric so a session is reproducible.
alter table public.rubrics
  add column if not exists name_extraction_model text,
  add column if not exists audio_analysis_model text not null default 'gemini-3.6-flash',
  add column if not exists audio_analysis_modes text[] not null default '{}';

update public.rubrics
set
  name_extraction_model = coalesce(name_extraction_model, analysis_model),
  audio_analysis_modes = case
    when audio_understanding_enabled and coalesce(array_length(audio_analysis_modes, 1), 0) = 0
      then array['emotion', 'conversation_dynamics', 'ambience', 'participant_identity']::text[]
    else audio_analysis_modes
  end
where name_extraction_model is null
   or (audio_understanding_enabled and coalesce(array_length(audio_analysis_modes, 1), 0) = 0);

alter table public.rubrics
  alter column name_extraction_model set default 'claude-sonnet-4.5';

comment on column public.rubrics.name_extraction_model is
  'Text model used by the focused participant name-evidence pass.';
comment on column public.rubrics.audio_analysis_model is
  'Multimodal model used for opt-in audio-native analysis.';
comment on column public.rubrics.audio_analysis_modes is
  'Selected audio-native signal families: emotion, conversation_dynamics, ambience, participant_identity.';

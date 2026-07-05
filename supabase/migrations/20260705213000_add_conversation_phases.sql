-- Conversation phase segmentation (semantic, non-rubric) + segmenting pipeline status.
alter table sessions add column if not exists conversation_phases_json jsonb not null default '[]'::jsonb;

alter table sessions drop constraint if exists sessions_status_check;
alter table sessions add constraint sessions_status_check check (
  status in (
    'scheduled',
    'in_progress',
    'uploaded',
    'transcribing',
    'segmenting',
    'extracting_screenshots',
    'analyzing',
    'analysis_ready',
    'reviewed',
    'failed'
  )
);

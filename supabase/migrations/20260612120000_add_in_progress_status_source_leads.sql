-- Add in_progress to the session status lifecycle, plus creation source and lead capture.
alter table sessions drop constraint if exists sessions_status_check;
alter table sessions add constraint sessions_status_check check (
  status in (
    'scheduled',
    'in_progress',
    'uploaded',
    'transcribing',
    'extracting_screenshots',
    'analyzing',
    'analysis_ready',
    'reviewed',
    'failed'
  )
);

-- How the session was created: manual form vs prospect scanning the QR lead form.
alter table sessions add column if not exists source text not null default 'manual'
  check (source in ('manual', 'qr'));

-- Leads/contacts attached to this session group (multiple people on one tour).
alter table sessions add column if not exists leads jsonb not null default '[]'::jsonb;

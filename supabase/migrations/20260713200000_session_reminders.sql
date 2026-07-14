-- Session tour reminder tracking + expanded notification preference defaults (app-layer).
alter table public.sessions
  add column if not exists reminder_sent_at timestamptz;

create index if not exists sessions_reminder_due_idx
  on public.sessions (status, scheduled_at)
  where status = 'scheduled' and reminder_sent_at is null and scheduled_at is not null;

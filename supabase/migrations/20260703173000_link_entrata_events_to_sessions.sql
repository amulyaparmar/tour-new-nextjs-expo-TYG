alter table public.sessions
  drop constraint if exists sessions_source_check;

alter table public.sessions
  add constraint sessions_source_check
  check (source in ('manual', 'qr', 'entrata'));

alter table public.sessions
  add column if not exists external_provider text,
  add column if not exists external_event_id text,
  add column if not exists external_application_id text;

alter table public.sessions
  add constraint sessions_external_event_unique
  unique (property_id, external_provider, external_event_id);

create index if not exists sessions_external_application_id_idx
  on public.sessions(external_application_id)
  where external_application_id is not null;

alter table public.admin_calendar_events
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create index if not exists admin_calendar_events_session_id_idx
  on public.admin_calendar_events(session_id)
  where session_id is not null;

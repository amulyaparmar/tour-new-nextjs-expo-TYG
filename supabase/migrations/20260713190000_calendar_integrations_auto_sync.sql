-- Enable scheduled Entrata calendar sync per community.

alter table public.calendar_integrations
  add column if not exists auto_sync_enabled boolean not null default false;

comment on column public.calendar_integrations.auto_sync_enabled is
  'When true, Vercel cron syncs this community Entrata calendar every 12 hours.';

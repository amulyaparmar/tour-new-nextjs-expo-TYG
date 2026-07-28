alter table public.sessions
  add column if not exists customer_interests jsonb not null default '[]'::jsonb;

comment on column public.sessions.customer_interests is
  'Customer interests captured before a session and supplied to prospect analysis.';

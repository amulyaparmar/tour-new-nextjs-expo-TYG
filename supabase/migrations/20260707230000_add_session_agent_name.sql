alter table public.sessions
  add column if not exists agent_name text;

comment on column public.sessions.agent_name is
  'Display name of the leasing agent for this session (prefilled from signed-in user when available)';

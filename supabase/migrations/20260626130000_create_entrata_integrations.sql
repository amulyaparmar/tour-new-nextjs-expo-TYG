-- Durable Entrata integration connection state.

create table if not exists admin_integrations (
  provider text primary key,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'testing', 'connected', 'error')),
  domain text,
  property_id text,
  encrypted_credentials jsonb,
  scopes jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into admin_integrations (provider, status)
values ('entrata', 'disconnected')
on conflict (provider) do nothing;

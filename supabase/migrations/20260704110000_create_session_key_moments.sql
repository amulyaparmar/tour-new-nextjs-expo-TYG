create table if not exists session_key_moments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  author_name text not null default 'Reviewer',
  label text not null,
  timestamp_sec numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_key_moments_session_idx on session_key_moments (session_id, timestamp_sec);

-- Comments on sessions — supports timestamped comments linked to media playback position
create table if not exists session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  author_name text not null default 'Reviewer',
  body text not null,
  timestamp_sec numeric(10,2),  -- optional: links comment to a playback position
  parent_id uuid references session_comments(id) on delete cascade,  -- threaded replies
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_comments_session_idx on session_comments (session_id, created_at);
create index if not exists session_comments_parent_idx on session_comments (parent_id);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS transcript_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS screenshots_json jsonb NOT NULL DEFAULT '[]'::jsonb;

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('rubric', 'training', 'recording', 'other')),
  description text not null default '',
  file_url text,
  parsed_text text,
  session_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now()
);;

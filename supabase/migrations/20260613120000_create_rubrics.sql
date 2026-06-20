-- Custom evaluation rubrics + session rubric selection

create table if not exists rubrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source_file_url text,
  source_file_name text,
  template_text text,
  definition_json jsonb not null default '{}'::jsonb,
  total_points integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rubrics_created_at_idx on rubrics (created_at desc);
create index if not exists rubrics_is_default_idx on rubrics (is_default) where is_default = true;

alter table sessions
  add column if not exists rubric_id uuid references rubrics(id) on delete set null;

create index if not exists sessions_rubric_id_idx on sessions (rubric_id);

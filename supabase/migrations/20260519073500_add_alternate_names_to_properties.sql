alter table public."propertiesTYG"
  add column if not exists alternate_names text[] not null default '{}'::text[];
create index if not exists "propertiesTYG_alternate_names_gin_idx"
  on public."propertiesTYG"
  using gin (alternate_names);
comment on column public."propertiesTYG".alternate_names is
  'Alternative or previous property names observed from audits/imports. Current name remains propertiesTYG.name.';

alter table public."propertiesTYG"
  add column if not exists ai_enrich jsonb not null default '{}'::jsonb;
alter table public."seniorPropertiesTYG"
  add column if not exists ai_enrich jsonb not null default '{}'::jsonb;
create index if not exists "propertiesTYG_ai_enrich_gin_idx"
  on public."propertiesTYG"
  using gin (ai_enrich);
create index if not exists "seniorPropertiesTYG_ai_enrich_gin_idx"
  on public."seniorPropertiesTYG"
  using gin (ai_enrich);
comment on column public."propertiesTYG".ai_enrich is
  'AI enrichment results keyed by enrichment type, field set, or run id.';
comment on column public."seniorPropertiesTYG".ai_enrich is
  'AI enrichment results keyed by enrichment type, field set, or run id.';

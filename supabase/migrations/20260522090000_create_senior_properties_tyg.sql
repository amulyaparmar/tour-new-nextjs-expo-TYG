create table if not exists public."seniorPropertiesTYG" (
  like public."propertiesTYG" including defaults including generated including identity including constraints
);
alter table public."seniorPropertiesTYG"
  add column if not exists location_id text,
  add column if not exists canonical_name text,
  add column if not exists zip text,
  add column if not exists "placeId" text,
  add column if not exists phone_number text,
  add column if not exists asset_focus_all text,
  add column if not exists facility_type text,
  add column if not exists care_types text[] not null default '{}'::text[],
  add column if not exists management_group text,
  add column if not exists owner text,
  add column if not exists operator text,
  add column if not exists beds integer,
  add column if not exists serp_rating numeric,
  add column if not exists serp_rating_count integer,
  add column if not exists license_number text,
  add column if not exists ccn text,
  add column if not exists has_state_license boolean,
  add column if not exists has_cms_enrollment boolean,
  add column if not exists medicaid_certified boolean,
  add column if not exists medicare_certified boolean,
  add column if not exists subsidized boolean,
  add column if not exists hud_program text,
  add column if not exists num_sources integer,
  add column if not exists authority_tier text,
  add column if not exists confidence numeric,
  add column if not exists serp_website text,
  add column if not exists website_confidence text,
  add column if not exists mgmt_confidence text,
  add column if not exists operator_type text,
  add column if not exists sub_brand text,
  add column if not exists categories text[] not null default '{}'::text[],
  add column if not exists pricing jsonb,
  add column if not exists specials jsonb,
  add column if not exists citations jsonb,
  add column if not exists source_payload jsonb,
  add column if not exists created_at timestamptz not null default now();
create unique index if not exists "seniorPropertiesTYG_location_id_uidx"
  on public."seniorPropertiesTYG" (location_id)
  where location_id is not null;
create unique index if not exists "seniorPropertiesTYG_place_id_uidx"
  on public."seniorPropertiesTYG" (place_id)
  where place_id is not null;
create unique index if not exists "seniorPropertiesTYG_placeId_uidx"
  on public."seniorPropertiesTYG" ("placeId")
  where "placeId" is not null;
create index if not exists "seniorPropertiesTYG_name_idx"
  on public."seniorPropertiesTYG" (name);
create index if not exists "seniorPropertiesTYG_market_idx"
  on public."seniorPropertiesTYG" (state, city);
create index if not exists "seniorPropertiesTYG_care_types_gin_idx"
  on public."seniorPropertiesTYG"
  using gin (care_types);
create index if not exists "seniorPropertiesTYG_categories_gin_idx"
  on public."seniorPropertiesTYG"
  using gin (categories);
comment on table public."seniorPropertiesTYG" is
  'Senior living property table based on propertiesTYG, with additional care, license, operator, and Parallel enrichment fields.';
comment on column public."seniorPropertiesTYG".source_payload is
  'Original source row or webhook payload used to create or enrich this senior living property.';

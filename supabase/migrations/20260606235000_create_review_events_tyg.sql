create extension if not exists pgcrypto;
create table if not exists public."reviewEventsTYG" (
  id uuid primary key default gen_random_uuid(),
  property_id text null,
  place_id text null,
  event_type text not null default 'google_review',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public."reviewEventsTYG" enable row level security;
grant usage on schema public to service_role;
grant select, insert, update, delete on public."reviewEventsTYG" to service_role;
create index if not exists "reviewEventsTYG_property_created_idx"
  on public."reviewEventsTYG" (property_id, created_at desc);
create index if not exists "reviewEventsTYG_place_created_idx"
  on public."reviewEventsTYG" (place_id, created_at desc);
create index if not exists "reviewEventsTYG_event_type_created_idx"
  on public."reviewEventsTYG" (event_type, created_at desc);
create index if not exists "reviewEventsTYG_data_gin_idx"
  on public."reviewEventsTYG"
  using gin (data);
create unique index if not exists "reviewEventsTYG_entity_event_provider_hash_uidx"
  on public."reviewEventsTYG" (
    (coalesce(place_id, property_id, data ->> 'entity_id')),
    event_type,
    ((data ->> 'provider')),
    ((data ->> 'review_hash'))
  )
  where coalesce(place_id, property_id, data ->> 'entity_id') is not null
    and data ? 'provider'
    and data ? 'review_hash';
create or replace function public.update_review_events_tyg_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trigger_update_review_events_tyg_updated_at on public."reviewEventsTYG";
create trigger trigger_update_review_events_tyg_updated_at
before update on public."reviewEventsTYG"
for each row
execute function public.update_review_events_tyg_updated_at();
comment on table public."reviewEventsTYG" is
  'Canonical review event ledger. Thin envelope mirrors datalakeTYG while event-specific fields live in data.';
comment on column public."reviewEventsTYG".event_type is
  'Examples: google_review, google_review_response, apartmentratings_review. Keeps the table review-focused but provider-extensible.';
comment on column public."reviewEventsTYG".data is
  'Provider payload and normalized review fields: market_key, source, provider, review_hash, rating, text, author_name, published_at, fetched_at, sentiment, topics, needs_response, raw.';
notify pgrst, 'reload schema';

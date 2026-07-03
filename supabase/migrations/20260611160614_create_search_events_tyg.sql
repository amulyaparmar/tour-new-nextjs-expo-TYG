create extension if not exists pgcrypto;

create table if not exists public."searchEventsTYG" (
  id uuid primary key default gen_random_uuid(),
  property_id text null,
  place_id text null,
  event_type text not null default 'search_visibility_snapshot',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public."searchEventsTYG" enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public."searchEventsTYG" to service_role;

create index if not exists "searchEventsTYG_property_created_idx"
  on public."searchEventsTYG" (property_id, created_at desc);

create index if not exists "searchEventsTYG_place_created_idx"
  on public."searchEventsTYG" (place_id, created_at desc);

create index if not exists "searchEventsTYG_event_type_created_idx"
  on public."searchEventsTYG" (event_type, created_at desc);

create index if not exists "searchEventsTYG_data_gin_idx"
  on public."searchEventsTYG"
  using gin (data);

create unique index if not exists "searchEventsTYG_run_query_surface_uidx"
  on public."searchEventsTYG" (
    (coalesce(place_id, property_id, data -> 'target' ->> 'entity_id')),
    event_type,
    ((data ->> 'run_id')),
    ((data -> 'query' ->> 'id')),
    ((data ->> 'surface'))
  )
  where coalesce(place_id, property_id, data -> 'target' ->> 'entity_id') is not null
    and data ? 'run_id'
    and data ? 'surface'
    and data ? 'query';

create or replace function public.update_search_events_tyg_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_update_search_events_tyg_updated_at on public."searchEventsTYG";
create trigger trigger_update_search_events_tyg_updated_at
before update on public."searchEventsTYG"
for each row
execute function public.update_search_events_tyg_updated_at();

comment on table public."searchEventsTYG" is
  'Canonical search visibility event ledger for Google organic, Google Maps, and AI answer visibility. Thin envelope mirrors reviewEventsTYG while event-specific fields live in data.';

comment on column public."searchEventsTYG".event_type is
  'Examples: search_visibility_snapshot, ai_answer_snapshot, maps_rank_snapshot. The MVP uses search_visibility_snapshot.';

comment on column public."searchEventsTYG".data is
  'Normalized query snapshot data: query settings, surface, target rank, competitor matches, rankings, citations, request metadata, and compact raw provider payload.';

notify pgrst, 'reload schema';;

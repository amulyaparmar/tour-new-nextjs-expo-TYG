alter table public."propertiesTYG"
add column if not exists search_visibility jsonb;

alter table public."propertiesTYG"
alter column search_visibility
type jsonb
using coalesce(search_visibility::jsonb, '{"version":1,"enabled":false,"queries":[]}'::jsonb);

update public."propertiesTYG"
set search_visibility = '{"version":1,"enabled":false,"queries":[]}'::jsonb
where search_visibility is null;

alter table public."propertiesTYG"
alter column search_visibility set default '{"version":1,"enabled":false,"queries":[]}'::jsonb;

alter table public."propertiesTYG"
alter column search_visibility set not null;

create index if not exists "propertiesTYG_search_visibility_gin_idx"
  on public."propertiesTYG"
  using gin (search_visibility);

comment on column public."propertiesTYG".search_visibility is
  'Saved search visibility query configuration for SEO, Map Pack, and AI SEO surfaces. Captured results live in searchEventsTYG.';

notify pgrst, 'reload schema';;

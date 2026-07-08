alter table public.analyses
  add column if not exists version int,
  add column if not exists is_current boolean not null default true,
  add column if not exists rubric_id uuid null references public.rubrics(id) on delete set null,
  add column if not exists rubric_name text,
  add column if not exists trigger text check (trigger in ('initial', 'reanalyze'));

with numbered as (
  select
    id,
    row_number() over (partition by session_id order by created_at asc, id asc) as rn
  from public.analyses
)
update public.analyses a
set
  version = coalesce(a.version, numbered.rn),
  is_current = true,
  trigger = coalesce(a.trigger, 'initial')
from numbered
where a.id = numbered.id;

alter table public.analyses
  alter column version set not null;

drop index if exists public.analyses_session_id_key;

create unique index if not exists analyses_session_id_version_key
  on public.analyses (session_id, version);

create unique index if not exists analyses_session_current_key
  on public.analyses (session_id)
  where is_current;

create index if not exists analyses_session_id_version_idx
  on public.analyses (session_id, version desc);

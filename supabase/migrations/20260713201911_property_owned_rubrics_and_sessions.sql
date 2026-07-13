-- PropertiesTYG is the canonical tenancy boundary. Existing `community:*`
-- session/rubric values remain valid compatibility keys and are intentionally
-- not constrained to the legacy portal communities table.
alter table public.rubrics
  add column if not exists property_id text,
  add column if not exists is_template boolean not null default false,
  add column if not exists template_source_id uuid references public.rubrics(id) on delete set null;

create index if not exists rubrics_property_id_idx on public.rubrics(property_id);
create index if not exists rubrics_template_source_id_idx on public.rubrics(template_source_id);
create index if not exists sessions_property_id_idx on public.sessions(property_id);

-- Rubrics that predate property ownership (the current six) are the frozen library.
update public.rubrics
set is_template = true,
    property_id = null,
    template_source_id = null
where property_id is null
  and is_template = false;

-- Port every legacy assignment into a property-owned rubric. A rubric that was
-- assigned to several properties becomes one independent clone per property.
insert into public.rubrics (
  id, name, definition, analysis_model, transcribe_provider,
  audio_understanding_enabled, session_type, segmentation_prompt,
  analysis_prompt, source_url, is_default, company_id, property_id,
  is_template, template_source_id, created_at
)
select
  gen_random_uuid(), r.name, r.definition, r.analysis_model, r.transcribe_provider,
  r.audio_understanding_enabled, r.session_type, r.segmentation_prompt,
  r.analysis_prompt, r.source_url, false, r.company_id, rc.property_id,
  false, r.id, now()
from public.rubric_communities rc
join public.rubrics r on r.id = rc.rubric_id
where not exists (
  select 1
  from public.rubrics existing
  where existing.template_source_id = r.id
    and existing.property_id = rc.property_id
);

create or replace function public.prevent_frozen_rubric_template_changes()
returns trigger
language plpgsql
as $$
begin
  if old.is_template then
    raise exception 'Frozen rubric templates cannot be updated or deleted; clone the template instead.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists prevent_frozen_rubric_template_changes on public.rubrics;
create trigger prevent_frozen_rubric_template_changes
before update or delete on public.rubrics
for each row execute function public.prevent_frozen_rubric_template_changes();

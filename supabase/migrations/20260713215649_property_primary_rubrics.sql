-- A default rubric is property-scoped. Preserve an existing default when one
-- exists; otherwise promote the oldest editable rubric for each property.
with ranked_property_rubrics as (
  select
    id,
    row_number() over (
      partition by property_id
      order by is_default desc, created_at asc, id asc
    ) as primary_rank
  from public.rubrics
  where coalesce(is_template, false) = false
    and property_id is not null
)
update public.rubrics as rubric
set is_default = (ranked.primary_rank = 1)
from ranked_property_rubrics as ranked
where rubric.id = ranked.id
  and rubric.is_default is distinct from (ranked.primary_rank = 1);

create unique index if not exists rubrics_one_primary_per_property_idx
  on public.rubrics (property_id)
  where is_default = true
    and is_template = false
    and property_id is not null;

-- Existing sessions without an explicit rubric inherit their property's
-- primary rubric. Explicit historical rubric choices remain untouched.
update public.sessions as session
set rubric_id = rubric.id
from public.rubrics as rubric
where session.rubric_id is null
  and session.property_id = rubric.property_id
  and rubric.is_default = true
  and rubric.is_template = false;

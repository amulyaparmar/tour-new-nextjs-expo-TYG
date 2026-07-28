-- Keep the customer-facing rubric template library compact and non-duplicative.
-- The 30-criteria in-person tour template is the superset of the older
-- 27-criteria variants, so keep it and give it a clean product name.

drop trigger if exists prevent_frozen_rubric_template_changes on public.rubrics;

with template_counts as (
  select
    r.id,
    r.name,
    coalesce(sum(jsonb_array_length(section.value -> 'items')), 0) as criteria_count
  from public.rubrics r
  cross join lateral jsonb_array_elements(r.definition -> 'sections') as section(value)
  where r.is_template = true
    and r.property_id is null
  group by r.id, r.name
)
update public.rubrics r
set name = 'Apartment In-Person Tour'
from template_counts c
where r.id = c.id
  and c.name = 'SURVEY: APARTMENT: IN-PERSON TOUR'
  and c.criteria_count = 30;

with template_counts as (
  select
    r.id,
    r.name,
    coalesce(sum(jsonb_array_length(section.value -> 'items')), 0) as criteria_count
  from public.rubrics r
  cross join lateral jsonb_array_elements(r.definition -> 'sections') as section(value)
  where r.is_template = true
    and r.property_id is null
  group by r.id, r.name
)
update public.rubrics r
set is_template = false
from template_counts c
where r.id = c.id
  and c.criteria_count = 27
  and c.name in (
    'Apartment In-Person Tour',
    'SURVEY: APARTMENT: INPERSON TOUR'
  );

create trigger prevent_frozen_rubric_template_changes
before update or delete on public.rubrics
for each row execute function public.prevent_frozen_rubric_template_changes();

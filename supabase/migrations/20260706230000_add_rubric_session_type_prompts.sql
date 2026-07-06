alter table rubrics
  add column if not exists session_type text,
  add column if not exists segmentation_prompt text,
  add column if not exists analysis_prompt text;

update rubrics
set session_type = coalesce(session_type, 'in_person_tour')
where session_type is null;

-- Simplify rubrics: definition is the single source of truth; drop redundant columns.

alter table rubrics rename column definition_json to definition;
alter table rubrics rename column source_file_url to source_url;

alter table rubrics drop column if exists description;
alter table rubrics drop column if exists source_file_name;
alter table rubrics drop column if exists template_text;
alter table rubrics drop column if exists total_points;
alter table rubrics drop column if exists updated_at;

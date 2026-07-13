-- Nullable so manually-created rubrics and repeated template clones remain
-- unrestricted. Only the automatic first-login clone receives a key.
alter table public.rubrics
  add column if not exists bootstrap_key text;

create unique index if not exists rubrics_bootstrap_key_unique_idx
  on public.rubrics(bootstrap_key);

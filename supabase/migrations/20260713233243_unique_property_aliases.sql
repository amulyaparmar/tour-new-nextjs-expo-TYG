create unique index if not exists properties_tyg_unique_alias_idx
  on public."propertiesTYG" (lower(alias))
  where nullif(trim(alias), '') is not null;

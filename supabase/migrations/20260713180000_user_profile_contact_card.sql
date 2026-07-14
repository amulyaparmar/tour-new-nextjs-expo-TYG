-- Contact-card fields for mobile/web profile editing.
alter table public.user_profiles
  add column if not exists title text,
  add column if not exists phone text,
  add column if not exists card_accent text;

comment on column public.user_profiles.title is 'Public-facing title shown on the agent contact card.';
comment on column public.user_profiles.phone is 'Public-facing phone shown on the agent contact card.';
comment on column public.user_profiles.card_accent is 'Hex accent color for the agent contact card (e.g. #006CE5).';

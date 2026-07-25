-- Sign-in codes must be verified by the server before an authenticated session
-- is minted. This table is intentionally service-role-only: browser and mobile
-- clients receive an opaque challenge id, never the expected code or its hash.
create table if not exists public.admin_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0
    check (attempts >= 0 and attempts <= 5),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_otp_challenges_normalized_email_check
    check (email = lower(btrim(email)) and position('@' in email) > 1)
);

create unique index if not exists admin_otp_challenges_one_active_per_email_idx
  on public.admin_otp_challenges (email)
  where used_at is null;

create index if not exists admin_otp_challenges_expires_at_idx
  on public.admin_otp_challenges (expires_at);

alter table public.admin_otp_challenges enable row level security;

revoke all on table public.admin_otp_challenges from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_otp_challenges to service_role;

comment on table public.admin_otp_challenges is
  'Short-lived, one-use server-side challenges for Tour admin email sign-in.';

-- Retain only a one-way request fingerprint so the server can enforce rolling
-- issuance limits without storing a raw client address.
alter table public.admin_otp_challenges
  add column if not exists request_fingerprint text;

create index if not exists admin_otp_challenges_email_created_at_idx
  on public.admin_otp_challenges (email, created_at desc);

create index if not exists admin_otp_challenges_fingerprint_created_at_idx
  on public.admin_otp_challenges (request_fingerprint, created_at desc)
  where request_fingerprint is not null;

comment on column public.admin_otp_challenges.request_fingerprint is
  'HMAC fingerprint used only for short-window OTP issuance rate limits.';

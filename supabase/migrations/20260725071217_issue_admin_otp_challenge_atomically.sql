-- Serialize issuance by request fingerprint and email so concurrent requests
-- cannot race past the rolling limits enforced by the custom OTP endpoint.
create or replace function public.issue_admin_otp_challenge(
  p_challenge_id uuid,
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_request_fingerprint text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
  active_created_at timestamptz;
begin
  if p_request_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('admin-otp-fingerprint:' || p_request_fingerprint, 0)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-otp-email:' || p_email, 0)
  );

  select count(*) into recent_count
  from public.admin_otp_challenges
  where email = p_email
    and created_at >= now() - interval '15 minutes';
  if recent_count >= 5 then
    return 'rate_email';
  end if;

  if p_request_fingerprint is not null then
    select count(*) into recent_count
    from public.admin_otp_challenges
    where request_fingerprint = p_request_fingerprint
      and created_at >= now() - interval '15 minutes';
    if recent_count >= 20 then
      return 'rate_fingerprint';
    end if;
  end if;

  select created_at into active_created_at
  from public.admin_otp_challenges
  where email = p_email
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;
  if active_created_at > now() - interval '30 seconds' then
    return 'cooldown';
  end if;

  update public.admin_otp_challenges
  set used_at = now()
  where email = p_email
    and used_at is null;

  insert into public.admin_otp_challenges (
    id,
    email,
    code_hash,
    expires_at,
    request_fingerprint
  )
  values (
    p_challenge_id,
    p_email,
    p_code_hash,
    p_expires_at,
    p_request_fingerprint
  );

  return 'issued';
end;
$$;

revoke all on function public.issue_admin_otp_challenge(uuid, text, text, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.issue_admin_otp_challenge(uuid, text, text, timestamptz, text)
to service_role;

comment on function public.issue_admin_otp_challenge(uuid, text, text, timestamptz, text) is
  'Atomically rate-limits, rotates, and creates a server-side admin email OTP challenge.';

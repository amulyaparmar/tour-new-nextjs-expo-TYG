-- Serialize verification attempts for a challenge so parallel requests cannot
-- bypass the five-attempt limit. Only the service role may call this function.
create or replace function public.consume_admin_otp_challenge(
  p_challenge_id uuid,
  p_email text,
  p_code_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.admin_otp_challenges%rowtype;
begin
  select *
  into challenge
  from public.admin_otp_challenges
  where id = p_challenge_id
    and email = p_email
  for update;

  if not found or challenge.used_at is not null then
    return 'invalid';
  end if;

  if challenge.expires_at <= now() then
    update public.admin_otp_challenges
    set used_at = now()
    where id = challenge.id;
    return 'expired';
  end if;

  if challenge.attempts >= 5 then
    update public.admin_otp_challenges
    set used_at = coalesce(used_at, now())
    where id = challenge.id;
    return 'invalid';
  end if;

  if challenge.code_hash is distinct from p_code_hash then
    update public.admin_otp_challenges
    set
      attempts = attempts + 1,
      used_at = case when attempts + 1 >= 5 then now() else used_at end
    where id = challenge.id;
    return 'invalid';
  end if;

  update public.admin_otp_challenges
  set used_at = now()
  where id = challenge.id;
  return 'valid';
end;
$$;

revoke all on function public.consume_admin_otp_challenge(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.consume_admin_otp_challenge(uuid, text, text)
to service_role;

comment on function public.consume_admin_otp_challenge(uuid, text, text) is
  'Atomically validates and consumes a server-issued admin email OTP challenge.';

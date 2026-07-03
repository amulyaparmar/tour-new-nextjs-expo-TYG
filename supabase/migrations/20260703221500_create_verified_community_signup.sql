-- Verified signup flow for joining an existing community or creating a new workspace.

alter table public.communities add column if not exists formatted_address text;
alter table public.communities add column if not exists phone text;
alter table public.communities add column if not exists website text;
alter table public.communities add column if not exists google_maps_url text;

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  mode text not null check (mode in ('join', 'create')),
  community_id text references public.communities(id) on delete cascade,
  resolved_community_id text references public.communities(id) on delete set null,
  company_name text,
  gmb_place_id text not null,
  business_name text not null,
  formatted_address text,
  phone text,
  website text,
  google_maps_url text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mode = 'join' and community_id is not null)
    or (mode = 'create' and community_id is null)
  )
);

create index if not exists registration_requests_email_status_idx
  on public.registration_requests(lower(email), status, created_at desc);

alter table public.registration_requests enable row level security;

create or replace function public.complete_verified_registration(
  request_id uuid,
  auth_user_id uuid
)
returns table (
  selected_community_id text,
  selected_membership_id uuid,
  selected_role text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  signup public.registration_requests%rowtype;
  auth_email text;
  target_company_id uuid;
  target_community_id text;
  target_membership_id uuid;
  target_role text;
  company_slug text;
begin
  select *
  into signup
  from public.registration_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'Registration request not found.';
  end if;
  if signup.status <> 'pending' then
    raise exception 'Registration request is no longer pending.';
  end if;
  if signup.expires_at <= now() then
    update public.registration_requests
    set status = 'expired', updated_at = now()
    where id = signup.id;
    raise exception 'Registration request has expired.';
  end if;

  select lower(email)
  into auth_email
  from auth.users
  where id = auth_user_id;

  if auth_email is null or auth_email <> lower(signup.email) then
    raise exception 'Verified user does not match this registration.';
  end if;

  if signup.mode = 'join' then
    select community.company_id, community.id
    into target_company_id, target_community_id
    from public.communities community
    where community.id = signup.community_id
      and community.gmb_id = signup.gmb_place_id
      and community.portal_enabled = true;

    if target_community_id is null then
      raise exception 'The selected community is not available.';
    end if;
    target_role := 'member';
  else
    if exists (
      select 1
      from public.communities community
      where community.gmb_id = signup.gmb_place_id
    ) then
      raise exception 'A team already exists for this business.';
    end if;

    company_slug := trim(both '-' from regexp_replace(
      lower(coalesce(nullif(signup.company_name, ''), signup.business_name)),
      '[^a-z0-9]+',
      '-',
      'g'
    ));
    if company_slug = '' then
      company_slug := 'workspace';
    end if;
    company_slug := company_slug || '-' || substr(replace(signup.id::text, '-', ''), 1, 8);

    insert into public.companies (name, slug)
    values (
      coalesce(nullif(signup.company_name, ''), signup.business_name),
      company_slug
    )
    returning id into target_company_id;

    target_community_id := 'gmb:' || signup.gmb_place_id;
    insert into public.communities (
      id,
      name,
      company_id,
      gmb_id,
      alias,
      portal_enabled,
      formatted_address,
      phone,
      website,
      google_maps_url
    )
    values (
      target_community_id,
      signup.business_name,
      target_company_id,
      signup.gmb_place_id,
      company_slug,
      true,
      signup.formatted_address,
      signup.phone,
      signup.website,
      signup.google_maps_url
    );
    target_role := 'admin';
  end if;

  insert into public.user_profiles (user_id, email, full_name)
  values (auth_user_id, lower(signup.email), signup.full_name)
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();

  insert into public.company_memberships (user_id, company_id, role, status)
  values (auth_user_id, target_company_id, target_role, 'active')
  on conflict (user_id, company_id) do update set
    status = 'active',
    role = case
      when public.company_memberships.role = 'admin' then 'admin'
      when public.company_memberships.role = 'manager' and excluded.role = 'member' then 'manager'
      else excluded.role
    end,
    updated_at = now()
  returning id, role into target_membership_id, target_role;

  insert into public.membership_communities (membership_id, property_id)
  values (target_membership_id, target_community_id)
  on conflict do nothing;

  insert into public.agents (
    id,
    name,
    full_name,
    role,
    property_id,
    company_id,
    auth_user_id,
    membership_id
  )
  values (
    'user:' || auth_user_id::text,
    split_part(signup.full_name, ' ', 1),
    signup.full_name,
    case target_role
      when 'admin' then 'Administrator'
      when 'manager' then 'Community Manager'
      else 'Leasing Agent'
    end,
    target_community_id,
    target_company_id,
    auth_user_id,
    target_membership_id
  )
  on conflict (id) do update set
    name = excluded.name,
    full_name = excluded.full_name,
    role = excluded.role,
    property_id = excluded.property_id,
    company_id = excluded.company_id,
    auth_user_id = excluded.auth_user_id,
    membership_id = excluded.membership_id;

  update public.registration_requests
  set
    status = 'completed',
    resolved_community_id = target_community_id,
    completed_at = now(),
    updated_at = now()
  where id = signup.id;

  return query
  select target_community_id, target_membership_id, target_role;
end;
$$;

revoke all on function public.complete_verified_registration(uuid, uuid) from public;
revoke all on function public.complete_verified_registration(uuid, uuid) from anon;
revoke all on function public.complete_verified_registration(uuid, uuid) from authenticated;
grant execute on function public.complete_verified_registration(uuid, uuid) to service_role;

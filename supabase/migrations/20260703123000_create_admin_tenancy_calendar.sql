-- Community-scoped admin tenancy, team access, rubric assignments, and calendar sync.
-- Legacy Tour tables remain the source for community identity and Entrata credentials.

create extension if not exists "pgcrypto";

create table if not exists admin_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into admin_companies (name, slug)
values ('CLS Living', 'cls-living')
on conflict (slug) do update set name = excluded.name;

alter table admin_properties add column if not exists company_id uuid references admin_companies(id) on delete cascade;
alter table admin_properties add column if not exists tour_community_id bigint;
alter table admin_properties add column if not exists gmb_id text;
alter table admin_properties add column if not exists alias text;
alter table admin_properties add column if not exists entrata_property_id text;
alter table admin_properties add column if not exists entrata_property_name text;
alter table admin_properties add column if not exists timezone text;
alter table admin_properties add column if not exists portal_enabled boolean not null default false;

create unique index if not exists admin_properties_tour_community_id_key
  on admin_properties(tour_community_id)
  where tour_community_id is not null;
create unique index if not exists admin_properties_gmb_id_key
  on admin_properties(gmb_id)
  where gmb_id is not null and gmb_id <> '';
create index if not exists admin_properties_company_id_idx on admin_properties(company_id);

insert into admin_properties (
  id,
  name,
  company_id,
  tour_community_id,
  gmb_id,
  alias,
  entrata_property_id,
  entrata_property_name,
  timezone,
  portal_enabled
)
select
  'community:' || c.id::text,
  regexp_replace(c.name, '^CLS - ', ''),
  company.id,
  c.id,
  nullif(nullif(trim(both '"' from c."gmbId"::text), 'null'), ''),
  coalesce(m.alias, c.alias),
  nullif(m.integration_details -> 'api-entrata' ->> 'property_id', ''),
  nullif(m.integration_details -> 'api-entrata' ->> 'property_name', ''),
  nullif(m.integration_details -> 'api-entrata' ->> 'property_timezone', ''),
  true
from "Community" c
cross join (select id from admin_companies where slug = 'cls-living') company
left join lateral (
  select magnet.alias, magnet.integration_details
  from "Magnet" magnet
  where magnet.community_id = c.id
  order by magnet.created_at asc nulls last
  limit 1
) m on true
where c.name like 'CLS - %'
on conflict (id) do update set
  name = excluded.name,
  company_id = excluded.company_id,
  tour_community_id = excluded.tour_community_id,
  gmb_id = excluded.gmb_id,
  alias = excluded.alias,
  entrata_property_id = excluded.entrata_property_id,
  entrata_property_name = excluded.entrata_property_name,
  timezone = excluded.timezone,
  portal_enabled = true;

create table if not exists admin_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references admin_companies(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'manager', 'member')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, company_id)
);

create index if not exists admin_memberships_user_id_idx on admin_memberships(user_id);
create index if not exists admin_memberships_company_id_idx on admin_memberships(company_id);

create table if not exists admin_membership_communities (
  membership_id uuid not null references admin_memberships(id) on delete cascade,
  property_id text not null references admin_properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, property_id)
);

create index if not exists admin_membership_communities_property_id_idx
  on admin_membership_communities(property_id);

insert into admin_user_profiles (user_id, email, full_name, avatar_url)
select
  au.id,
  lower(au.email),
  nullif(coalesce(legacy.name, au.raw_user_meta_data ->> 'full_name'), ''),
  nullif(coalesce(legacy.image, au.raw_user_meta_data ->> 'avatar_url'), '')
from auth.users au
left join lateral (
  select legacy_user.name, legacy_user.image
  from "Users" legacy_user
  where lower(legacy_user.email) = lower(au.email)
  order by
    (lower(coalesce(legacy_user.global_admin::text, '')) in ('true', 't', '1', 'yes')) desc,
    (lower(coalesce(legacy_user.lm_admin::text, '')) in ('true', 't', '1', 'yes')) desc,
    legacy_user.id
  limit 1
) legacy on true
where au.email is not null
on conflict (user_id) do update set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, admin_user_profiles.full_name),
  avatar_url = coalesce(excluded.avatar_url, admin_user_profiles.avatar_url),
  updated_at = now();

insert into admin_memberships (user_id, company_id, role, status)
select
  au.id,
  company.id,
  case
    when exists (
      select 1
      from "Users" legacy
      where lower(legacy.email) = lower(au.email)
        and (
          lower(coalesce(legacy.global_admin::text, '')) in ('true', 't', '1', 'yes')
          or lower(coalesce(legacy.lm_admin::text, '')) in ('true', 't', '1', 'yes')
        )
    ) then 'admin'
    when exists (
      select 1
      from "Permissions" permission
      join "Community" community on community.id = permission.community_id
      where lower(permission.email) = lower(au.email)
        and community.name like 'CLS - %'
        and lower(coalesce(permission.access_level, '')) in ('admin', 'manager', 'owner')
    ) then 'manager'
    else 'member'
  end,
  'active'
from auth.users au
cross join (select id from admin_companies where slug = 'cls-living') company
where au.email is not null
  and (
    exists (
      select 1
      from "Users" legacy
      where lower(legacy.email) = lower(au.email)
        and (
          lower(coalesce(legacy.global_admin::text, '')) in ('true', 't', '1', 'yes')
          or lower(coalesce(legacy.lm_admin::text, '')) in ('true', 't', '1', 'yes')
        )
    )
    or exists (
      select 1
      from "Permissions" permission
      join "Community" community on community.id = permission.community_id
      where lower(permission.email) = lower(au.email)
        and community.name like 'CLS - %'
    )
  )
on conflict (user_id, company_id) do update set
  role = case
    when admin_memberships.role = 'admin' or excluded.role = 'admin' then 'admin'
    when admin_memberships.role = 'manager' or excluded.role = 'manager' then 'manager'
    else 'member'
  end,
  status = 'active',
  updated_at = now();

-- Guarantee an initial portal administrator even when no legacy admin email matches Auth.
insert into admin_memberships (user_id, company_id, role, status)
select
  au.id,
  company.id,
  'admin',
  'active'
from auth.users au
cross join (select id from admin_companies where slug = 'cls-living') company
where au.email is not null
  and not exists (
    select 1
    from admin_memberships membership
    where membership.company_id = company.id
      and membership.role = 'admin'
  )
order by au.created_at asc
limit 1
on conflict (user_id, company_id) do update set
  role = 'admin',
  status = 'active',
  updated_at = now();

insert into admin_membership_communities (membership_id, property_id)
select membership.id, property.id
from admin_memberships membership
join admin_properties property on property.company_id = membership.company_id
where membership.role = 'admin'
  and property.portal_enabled = true
on conflict do nothing;

insert into admin_membership_communities (membership_id, property_id)
select distinct membership.id, property.id
from admin_memberships membership
join admin_user_profiles profile on profile.user_id = membership.user_id
join "Permissions" permission on lower(permission.email) = lower(profile.email)
join admin_properties property
  on property.tour_community_id = permission.community_id
 and property.company_id = membership.company_id
where membership.role <> 'admin'
on conflict do nothing;

alter table admin_agents add column if not exists company_id uuid references admin_companies(id) on delete cascade;
alter table admin_agents add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table admin_agents add column if not exists membership_id uuid references admin_memberships(id) on delete set null;

create unique index if not exists admin_agents_auth_user_id_key
  on admin_agents(auth_user_id)
  where auth_user_id is not null;
create index if not exists admin_agents_company_id_idx on admin_agents(company_id);

update admin_agents
set
  company_id = (select id from admin_companies where slug = 'cls-living'),
  property_id = coalesce(
    (select id from admin_properties where tour_community_id = 548),
    (select id from admin_properties where portal_enabled order by name limit 1)
  )
where company_id is null;

update sessions
set property_id = coalesce(
  (select id from admin_properties where tour_community_id = 548),
  (select id from admin_properties where portal_enabled order by name limit 1)
)
where property_id in ('p1', 'p2', 'p3', 'p4');

insert into admin_agents (
  id,
  name,
  full_name,
  role,
  property_id,
  company_id,
  auth_user_id,
  membership_id
)
select
  'user:' || profile.user_id::text,
  coalesce(nullif(split_part(profile.full_name, ' ', 1), ''), split_part(profile.email, '@', 1)),
  coalesce(nullif(profile.full_name, ''), split_part(profile.email, '@', 1)),
  case membership.role
    when 'admin' then 'Administrator'
    when 'manager' then 'Community Manager'
    else 'Leasing Agent'
  end,
  access.property_id,
  membership.company_id,
  profile.user_id,
  membership.id
from admin_memberships membership
join admin_user_profiles profile on profile.user_id = membership.user_id
left join lateral (
  select membership_community.property_id
  from admin_membership_communities membership_community
  where membership_community.membership_id = membership.id
  order by membership_community.property_id
  limit 1
) access on true
on conflict (id) do update set
  name = excluded.name,
  full_name = excluded.full_name,
  role = excluded.role,
  property_id = excluded.property_id,
  company_id = excluded.company_id,
  auth_user_id = excluded.auth_user_id,
  membership_id = excluded.membership_id;

alter table rubrics add column if not exists company_id uuid references admin_companies(id) on delete cascade;

update rubrics
set company_id = (select id from admin_companies where slug = 'cls-living')
where company_id is null;

create index if not exists rubrics_company_id_idx on rubrics(company_id);

create table if not exists rubric_communities (
  rubric_id uuid not null references rubrics(id) on delete cascade,
  property_id text not null references admin_properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rubric_id, property_id)
);

create index if not exists rubric_communities_property_id_idx
  on rubric_communities(property_id);

insert into rubric_communities (rubric_id, property_id)
select rubric.id, property.id
from rubrics rubric
join admin_properties property on property.company_id = rubric.company_id
where property.portal_enabled = true
on conflict do nothing;

create table if not exists admin_calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references admin_companies(id) on delete cascade,
  property_id text not null references admin_properties(id) on delete cascade,
  provider text not null default 'entrata'
    check (provider in ('entrata', 'google_calendar', 'outlook')),
  source text not null default 'tour_new',
  external_property_id text,
  status text not null default 'connected'
    check (status in ('disconnected', 'connected', 'syncing', 'error')),
  last_synced_at timestamptz,
  last_error text,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, provider)
);

insert into admin_calendar_integrations (
  company_id,
  property_id,
  provider,
  source,
  external_property_id,
  status
)
select
  property.company_id,
  property.id,
  'entrata',
  'tour_new',
  property.entrata_property_id,
  case when property.entrata_property_id is null then 'disconnected' else 'connected' end
from admin_properties property
where property.portal_enabled = true
on conflict (property_id, provider) do update set
  company_id = excluded.company_id,
  external_property_id = excluded.external_property_id,
  status = excluded.status,
  updated_at = now();

create table if not exists admin_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references admin_companies(id) on delete cascade,
  property_id text not null references admin_properties(id) on delete cascade,
  provider text not null default 'entrata',
  external_event_id text not null,
  external_application_id text,
  event_type text not null
    check (event_type in ('in_person', 'virtual', 'other')),
  status text not null default 'scheduled',
  appointment_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  time_from text,
  time_to text,
  prospect_name text,
  prospect_email text,
  prospect_phone text,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, provider, external_event_id)
);

create index if not exists admin_calendar_events_property_date_idx
  on admin_calendar_events(property_id, appointment_date, starts_at);
create index if not exists admin_calendar_events_application_id_idx
  on admin_calendar_events(external_application_id)
  where external_application_id is not null;

alter table admin_companies enable row level security;
alter table admin_properties enable row level security;
alter table admin_user_profiles enable row level security;
alter table admin_memberships enable row level security;
alter table admin_membership_communities enable row level security;
alter table rubric_communities enable row level security;
alter table admin_calendar_integrations enable row level security;
alter table admin_calendar_events enable row level security;

drop policy if exists "admin users can read own profile" on admin_user_profiles;
create policy "admin users can read own profile"
  on admin_user_profiles for select
  using (user_id = auth.uid());

drop policy if exists "admin users can read own memberships" on admin_memberships;
create policy "admin users can read own memberships"
  on admin_memberships for select
  using (user_id = auth.uid());

-- Import every active legacy Tour business into the shared tenancy model.
-- The original bootstrap only imported communities prefixed with "CLS - ",
-- which made the mobile and web business pickers appear CLS-only.

create extension if not exists "pgcrypto";

-- A legacy community name generally follows "Management Company - Property".
-- Communities without a prefix become a one-property company. Obvious records
-- marked as duplicates are intentionally skipped.
with normalized_legacy as (
  select
    legacy.id,
    regexp_replace(
      regexp_replace(btrim(legacy.name), '^\*Duplicate\*[[:space:]]*', '', 'i'),
      '^\*[[:space:]]*',
      ''
    ) as clean_name
  from public."Community" legacy
  where legacy.name is not null
    and btrim(legacy.name) <> ''
    and legacy.name not ilike '%duplicate%'
),
legacy_businesses as (
  select
    id,
    clean_name,
    case
      when clean_name ~ '[[:space:]]+[-–—][[:space:]]+'
        then regexp_replace(clean_name, '[[:space:]]+[-–—][[:space:]]+.*$', '')
      else clean_name
    end as raw_company_name
  from normalized_legacy
),
company_candidates as (
  select
    case
      when lower(btrim(raw_company_name)) = 'cls' then 'CLS Living'
      else btrim(raw_company_name)
    end as company_name,
    case
      when lower(btrim(raw_company_name)) = 'cls' then 'cls-living'
      else 'legacy-' || substr(md5(lower(btrim(raw_company_name))), 1, 24)
    end as company_slug
  from legacy_businesses
  where btrim(raw_company_name) <> ''
),
company_groups as (
  select min(company_name) as company_name, company_slug
  from company_candidates
  group by company_slug
)
insert into public.companies (name, slug)
select company_name, company_slug
from company_groups
on conflict (slug) do update set
  name = excluded.name,
  updated_at = now();

with normalized_legacy as (
  select
    legacy.id,
    legacy."gmbId",
    legacy.alias,
    regexp_replace(
      regexp_replace(btrim(legacy.name), '^\*Duplicate\*[[:space:]]*', '', 'i'),
      '^\*[[:space:]]*',
      ''
    ) as clean_name
  from public."Community" legacy
  where legacy.name is not null
    and btrim(legacy.name) <> ''
    and legacy.name not ilike '%duplicate%'
),
legacy_businesses as (
  select
    source.*,
    case
      when clean_name ~ '[[:space:]]+[-–—][[:space:]]+'
        then regexp_replace(clean_name, '[[:space:]]+[-–—][[:space:]]+.*$', '')
      else clean_name
    end as raw_company_name,
    case
      when clean_name ~ '[[:space:]]+[-–—][[:space:]]+'
        then regexp_replace(clean_name, '^.*?[[:space:]]+[-–—][[:space:]]+', '')
      else clean_name
    end as community_name
  from normalized_legacy source
)
insert into public.communities (
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
  'community:' || business.id::text,
  btrim(business.community_name),
  company.id,
  business.id,
  nullif(nullif(trim(both '"' from business."gmbId"::text), 'null'), ''),
  coalesce(magnet.alias, business.alias),
  nullif(magnet.integration_details -> 'api-entrata' ->> 'property_id', ''),
  nullif(magnet.integration_details -> 'api-entrata' ->> 'property_name', ''),
  nullif(magnet.integration_details -> 'api-entrata' ->> 'property_timezone', ''),
  true
from legacy_businesses business
join public.companies company
  on company.slug = case
    when lower(btrim(business.raw_company_name)) = 'cls' then 'cls-living'
    else 'legacy-' || substr(md5(lower(btrim(business.raw_company_name))), 1, 24)
  end
left join lateral (
  select item.alias, item.integration_details
  from public."Magnet" item
  where item.community_id = business.id
  order by item.created_at asc nulls last
  limit 1
) magnet on true
where btrim(business.community_name) <> ''
on conflict (id) do update set
  name = excluded.name,
  company_id = excluded.company_id,
  tour_community_id = excluded.tour_community_id,
  gmb_id = coalesce(excluded.gmb_id, public.communities.gmb_id),
  alias = coalesce(excluded.alias, public.communities.alias),
  entrata_property_id = coalesce(excluded.entrata_property_id, public.communities.entrata_property_id),
  entrata_property_name = coalesce(excluded.entrata_property_name, public.communities.entrata_property_name),
  timezone = coalesce(excluded.timezone, public.communities.timezone),
  portal_enabled = true;

-- Global legacy administrators retain global access across imported companies.
insert into public.company_memberships (user_id, company_id, role, status)
select distinct auth_user.id, company.id, 'admin', 'active'
from auth.users auth_user
join public."Users" legacy_user
  on lower(legacy_user.email) = lower(auth_user.email)
cross join public.companies company
where (company.slug = 'cls-living' or company.slug like 'legacy-%')
  and (
    lower(coalesce(legacy_user.global_admin::text, '')) in ('true', 't', '1', 'yes')
    or lower(coalesce(legacy_user.lm_admin::text, '')) in ('true', 't', '1', 'yes')
  )
on conflict (user_id, company_id) do update set
  role = 'admin',
  status = 'active',
  updated_at = now();

-- Community permissions create membership in the correct management company.
insert into public.company_memberships (user_id, company_id, role, status)
select distinct
  auth_user.id,
  community.company_id,
  case
    when lower(coalesce(permission.access_level, '')) in ('admin', 'manager', 'owner')
      then 'manager'
    else 'member'
  end,
  'active'
from auth.users auth_user
join public."Permissions" permission
  on lower(permission.email) = lower(auth_user.email)
join public.communities community
  on community.tour_community_id = permission.community_id
where community.portal_enabled = true
on conflict (user_id, company_id) do update set
  role = case
    when public.company_memberships.role = 'admin' then 'admin'
    when public.company_memberships.role = 'manager' or excluded.role = 'manager' then 'manager'
    else 'member'
  end,
  status = 'active',
  updated_at = now();

-- Administrators receive every community in their company.
insert into public.membership_communities (membership_id, property_id)
select membership.id, community.id
from public.company_memberships membership
join public.communities community on community.company_id = membership.company_id
where membership.role = 'admin'
  and membership.status = 'active'
  and community.portal_enabled = true
on conflict do nothing;

-- Other users receive only the communities granted by legacy permissions.
insert into public.membership_communities (membership_id, property_id)
select distinct membership.id, community.id
from auth.users auth_user
join public."Permissions" permission
  on lower(permission.email) = lower(auth_user.email)
join public.communities community
  on community.tour_community_id = permission.community_id
join public.company_memberships membership
  on membership.user_id = auth_user.id
 and membership.company_id = community.company_id
where membership.status = 'active'
on conflict do nothing;

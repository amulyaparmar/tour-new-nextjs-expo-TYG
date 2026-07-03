-- Promote the admin-portal tenancy tables into shared platform entities.
-- ALTER TABLE preserves data, foreign keys, policies, and dependent views.

do $$
begin
  if to_regclass('public.admin_companies') is not null
    and to_regclass('public.companies') is null then
    alter table public.admin_companies rename to companies;
  end if;

  if to_regclass('public.admin_properties') is not null
    and to_regclass('public.communities') is null then
    alter table public.admin_properties rename to communities;
  end if;

  if to_regclass('public.admin_user_profiles') is not null
    and to_regclass('public.user_profiles') is null then
    alter table public.admin_user_profiles rename to user_profiles;
  end if;

  if to_regclass('public.admin_memberships') is not null
    and to_regclass('public.company_memberships') is null then
    alter table public.admin_memberships rename to company_memberships;
  end if;

  if to_regclass('public.admin_membership_communities') is not null
    and to_regclass('public.membership_communities') is null then
    alter table public.admin_membership_communities rename to membership_communities;
  end if;

  if to_regclass('public.admin_agents') is not null
    and to_regclass('public.agents') is null then
    alter table public.admin_agents rename to agents;
  end if;

  if to_regclass('public.admin_calendar_integrations') is not null
    and to_regclass('public.calendar_integrations') is null then
    alter table public.admin_calendar_integrations rename to calendar_integrations;
  end if;

  if to_regclass('public.admin_calendar_events') is not null
    and to_regclass('public.calendar_events') is null then
    alter table public.admin_calendar_events rename to calendar_events;
  end if;
end
$$;

-- Constraint names do not follow table renames automatically.
do $$
declare
  item record;
  next_name text;
begin
  for item in
    select
      constraint_record.conrelid::regclass as table_name,
      constraint_record.conname
    from pg_constraint constraint_record
    where constraint_record.connamespace = 'public'::regnamespace
      and constraint_record.conname like 'admin\_%' escape '\'
  loop
    next_name := regexp_replace(item.conname, '^admin_', '');
    if not exists (
      select 1
      from pg_constraint existing
      where existing.connamespace = 'public'::regnamespace
        and existing.conname = next_name
    ) then
      execute format(
        'alter table %s rename constraint %I to %I',
        item.table_name,
        item.conname,
        next_name
      );
    end if;
  end loop;
end
$$;

-- Rename remaining standalone indexes after constraint-backed indexes.
do $$
declare
  item record;
  next_name text;
begin
  for item in
    select index_record.indexname
    from pg_indexes index_record
    where index_record.schemaname = 'public'
      and index_record.indexname like 'admin\_%' escape '\'
  loop
    next_name := regexp_replace(item.indexname, '^admin_', '');
    if to_regclass('public.' || quote_ident(next_name)) is null then
      execute format(
        'alter index public.%I rename to %I',
        item.indexname,
        next_name
      );
    end if;
  end loop;
end
$$;

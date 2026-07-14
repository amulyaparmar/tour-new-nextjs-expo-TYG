-- Property-team hierarchy cutover (keep parallel tables; stop treating them as live SOT).
-- 1) Nullable company_id on calendar_events so writes need no company.
-- 2) entrata_auto_sync_enabled on propertiesTYG for cron filters.
-- 3) Backfill profile/prefs onto property_team from user_profiles.
-- 4) Backfill Entrata sync settings onto propertiesTYG from calendar_integrations.

alter table public.calendar_events
  alter column company_id drop not null;

alter table public."propertiesTYG"
  add column if not exists entrata_auto_sync_enabled boolean not null default false;

comment on column public."propertiesTYG".entrata_auto_sync_enabled is
  'When true, cron auto-syncs Entrata for this property. Sync status lives in metadata.integrations.entrata.';

create index if not exists properties_tyg_entrata_auto_sync_idx
  on public."propertiesTYG" (id)
  where entrata_auto_sync_enabled = true;

-- Backfill Entrata sync settings from calendar_integrations → propertiesTYG.
with integration_matches as (
  select distinct on (property_id)
    property_id,
    status,
    auto_sync_enabled,
    last_synced_at,
    last_error,
    stats,
    external_property_id
  from (
    select
      p.id as property_id,
      ci.status,
      ci.auto_sync_enabled,
      ci.last_synced_at,
      ci.last_error,
      ci.stats,
      ci.external_property_id,
      ci.updated_at
    from public.calendar_integrations ci
    join public."propertiesTYG" p on p.id = ci.property_id
    where ci.provider = 'entrata'

    union all

    select
      p.id as property_id,
      ci.status,
      ci.auto_sync_enabled,
      ci.last_synced_at,
      ci.last_error,
      ci.stats,
      ci.external_property_id,
      ci.updated_at
    from public.calendar_integrations ci
    join public."propertiesTYG" p
      on ci.property_id = 'community:' || nullif(trim(p.tour_video_id #>> '{community_id}'), '')
    where ci.provider = 'entrata'
      and ci.property_id like 'community:%'

    union all

    select
      p.id as property_id,
      ci.status,
      ci.auto_sync_enabled,
      ci.last_synced_at,
      ci.last_error,
      ci.stats,
      ci.external_property_id,
      ci.updated_at
    from public.calendar_integrations ci
    join public.communities c on c.id = ci.property_id
    join public."propertiesTYG" p
      on nullif(trim(p.place_id), '') is not null
     and nullif(trim(c.gmb_id), '') = nullif(trim(p.place_id), '')
    where ci.provider = 'entrata'
  ) matched
  order by property_id, updated_at desc nulls last
)
update public."propertiesTYG" p
set
  entrata_auto_sync_enabled = coalesce(m.auto_sync_enabled, false),
  metadata = jsonb_set(
    coalesce(p.metadata, '{}'::jsonb),
    '{integrations,entrata}',
    jsonb_strip_nulls(
      jsonb_build_object(
        'autoSyncEnabled', coalesce(m.auto_sync_enabled, false),
        'status', m.status,
        'lastSyncedAt', m.last_synced_at,
        'lastError', m.last_error,
        'stats', coalesce(m.stats, '{}'::jsonb),
        'externalPropertyId', m.external_property_id
      )
    ),
    true
  ),
  updated_at = timezone('utc', now())
from integration_matches m
where p.id = m.property_id;

-- Backfill contact card + prefs + auth user_id onto each property_team member by email.
do $$
declare
  prop record;
  team jsonb;
  new_team jsonb;
  elem jsonb;
  member_email text;
  profile record;
begin
  for prop in
    select id, metadata
    from public."propertiesTYG"
    where metadata ? 'property_team'
      and jsonb_typeof(metadata->'property_team') = 'array'
  loop
    team := coalesce(prop.metadata->'property_team', '[]'::jsonb);
    new_team := '[]'::jsonb;

    for elem in select value from jsonb_array_elements(team)
    loop
      member_email := lower(trim(coalesce(elem->>'email', '')));
      if member_email = '' then
        new_team := new_team || jsonb_build_array(elem);
        continue;
      end if;

      select
        up.user_id,
        up.full_name,
        up.title,
        up.phone,
        up.card_accent,
        up.notification_preferences
      into profile
      from public.user_profiles up
      where lower(trim(up.email)) = member_email
      limit 1;

      if found then
        elem := elem || jsonb_strip_nulls(
          jsonb_build_object(
            'user_id', profile.user_id::text,
            'title', profile.title,
            'phone', coalesce(nullif(trim(coalesce(profile.phone, '')), ''), elem->>'phone'),
            'card_accent', profile.card_accent,
            'notification_preferences', profile.notification_preferences
          )
        );
        if nullif(trim(coalesce(elem->>'name', '')), '') is null
           and nullif(trim(coalesce(profile.full_name, '')), '') is not null then
          elem := jsonb_set(elem, '{name}', to_jsonb(trim(profile.full_name)));
        elsif nullif(trim(coalesce(profile.full_name, '')), '') is not null
              and nullif(trim(coalesce(elem->>'name', '')), '') is null then
          elem := jsonb_set(elem, '{name}', to_jsonb(trim(profile.full_name)));
        elsif nullif(trim(coalesce(profile.full_name, '')), '') is not null then
          -- Prefer profile display name when present.
          elem := jsonb_set(elem, '{name}', to_jsonb(trim(profile.full_name)));
        end if;
      end if;

      new_team := new_team || jsonb_build_array(elem);
    end loop;

    update public."propertiesTYG"
    set
      metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{property_team}', new_team, true),
      updated_at = timezone('utc', now())
    where id = prop.id;
  end loop;
end $$;

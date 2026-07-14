-- Session ownership now uses the member id/alias already stored in
-- propertiesTYG.metadata.property_team instead of the legacy agents table.
alter table public.sessions
  drop constraint if exists sessions_agent_id_fkey;

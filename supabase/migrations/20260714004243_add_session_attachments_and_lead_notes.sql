alter table public.sessions
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.sessions
  drop constraint if exists sessions_attachments_is_array;

alter table public.sessions
  add constraint sessions_attachments_is_array
  check (jsonb_typeof(attachments) = 'array');

create or replace function public.append_session_attachment(
  p_session_id uuid,
  p_attachment jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_attachment) <> 'object' then
    raise exception 'Session attachment must be a JSON object';
  end if;

  update public.sessions
  set attachments = coalesce(attachments, '[]'::jsonb) || jsonb_build_array(p_attachment)
  where id = p_session_id
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(attachments, '[]'::jsonb)) existing
      where existing->>'id' = p_attachment->>'id'
         or (
           nullif(existing->>'materialId', '') is not null
           and existing->>'materialId' = p_attachment->>'materialId'
         )
    );

  if not found then
    if not exists (select 1 from public.sessions where id = p_session_id) then
      raise exception 'Session not found';
    end if;
  end if;
end;
$$;

create or replace function public.update_session_lead_notes(
  p_session_id uuid,
  p_created_at text,
  p_notes text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_leads jsonb;
begin
  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'Session not found';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when lead->>'createdAt' = p_created_at
          then jsonb_set(lead, '{notes}', coalesce(to_jsonb(p_notes), 'null'::jsonb), true)
        else lead
      end
      order by ordinal
    ),
    '[]'::jsonb
  )
  into updated_leads
  from public.sessions session_row,
       jsonb_array_elements(coalesce(session_row.leads, '[]'::jsonb))
         with ordinality as entries(lead, ordinal)
  where session_row.id = p_session_id;

  update public.sessions
  set leads = updated_leads
  where id = p_session_id;
end;
$$;

revoke all on function public.append_session_attachment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_session_attachment(uuid, jsonb) to service_role;

revoke all on function public.update_session_lead_notes(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_session_lead_notes(uuid, text, text) to service_role;

-- Admin manager data model: properties, agents, prospect follow-up state, and
-- session ownership for admin filters/analytics.

create table if not exists admin_properties (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_agents (
  id text primary key,
  name text not null,
  full_name text not null,
  role text not null default 'Leasing Agent',
  property_id text references admin_properties(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table sessions add column if not exists agent_id text references admin_agents(id) on delete set null;
alter table sessions add column if not exists property_id text references admin_properties(id) on delete set null;
alter table sessions add column if not exists unit_label text;

create index if not exists sessions_agent_id_idx on sessions(agent_id);
create index if not exists sessions_property_id_idx on sessions(property_id);

create table if not exists prospect_follow_ups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  lead_index integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'sent', 'converted', 'lost')),
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, lead_index)
);

insert into admin_properties (id, name) values
  ('p1', 'The Meridian'),
  ('p2', 'Parkview Lofts'),
  ('p3', 'Cedar Commons'),
  ('p4', 'Riverton Heights')
on conflict (id) do update set name = excluded.name;

insert into admin_agents (id, name, full_name, role, property_id) values
  ('a1', 'Sarah K.', 'Sarah Kowalski', 'Senior Leasing Agent', 'p1'),
  ('a2', 'Marcus T.', 'Marcus Torres', 'Leasing Agent', 'p2'),
  ('a3', 'James R.', 'James Rivera', 'Leasing Agent', 'p3'),
  ('a4', 'Priya S.', 'Priya Sharma', 'Senior Leasing Agent', 'p4')
on conflict (id) do update set
  name = excluded.name,
  full_name = excluded.full_name,
  role = excluded.role,
  property_id = excluded.property_id;

with numbered as (
  select
    id,
    row_number() over (order by created_at asc, id asc) as rn
  from sessions
)
update sessions s
set
  agent_id = case ((n.rn - 1) % 4)
    when 0 then 'a1'
    when 1 then 'a2'
    when 2 then 'a3'
    else 'a4'
  end,
  property_id = case ((n.rn - 1) % 4)
    when 0 then 'p1'
    when 1 then 'p2'
    when 2 then 'p3'
    else 'p4'
  end,
  unit_label = coalesce(s.unit_label, case ((n.rn - 1) % 5)
    when 0 then '2B - 850 sqft'
    when 1 then '1A - 620 sqft'
    when 2 then '3C - 1,100 sqft'
    when 3 then 'Studio - 480 sqft'
    else '1B - 720 sqft'
  end)
from numbered n
where s.id = n.id
  and (s.agent_id is null or s.property_id is null or s.unit_label is null);

insert into prospect_follow_ups (session_id, lead_index, status, last_contact_at, next_follow_up_at)
select
  id,
  0,
  case
    when overall_score is not null and overall_score >= 85 then 'sent'
    when overall_score is not null and overall_score < 65 then 'pending'
    else 'pending'
  end,
  created_at,
  created_at + interval '2 days'
from sessions
on conflict (session_id, lead_index) do nothing;

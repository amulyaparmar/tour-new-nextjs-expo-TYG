alter table public.materials
  add column if not exists property_id text references public.admin_properties(id) on delete cascade;

create index if not exists materials_property_id_created_at_idx
  on public.materials(property_id, created_at desc);

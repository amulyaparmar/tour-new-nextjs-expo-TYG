create or replace function public.search_properties_tyg(
  search_term text,
  result_limit integer default 8
)
returns setof public."propertiesTYG"
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select
      btrim(coalesce(search_term, '')) as term,
      greatest(1, least(coalesce(result_limit, 8), 25)) as limit_count
  )
  select p.*
  from public."propertiesTYG" p
  cross join input i
  where i.term <> ''
    and (
      p.name ilike '%' || i.term || '%'
      or p.market_key ilike '%' || i.term || '%'
      or p.id::text ilike '%' || i.term || '%'
      or p.place_id::text ilike '%' || i.term || '%'
      or exists (
        select 1
        from unnest(coalesce(p.alternate_names, '{}'::text[])) as alt_name
        where alt_name ilike '%' || i.term || '%'
      )
      or (
        i.term ~ '^[0-9]+$'
        and (
          p.estimated_beds::text = i.term
          or p.estimated_units::text = i.term
          or p.unit_count::text = i.term
        )
      )
    )
  order by
    case
      when p.name ilike i.term || '%' then 0
      when exists (
        select 1
        from unnest(coalesce(p.alternate_names, '{}'::text[])) as alt_name
        where alt_name ilike i.term || '%'
      ) then 1
      when p.name ilike '%' || i.term || '%' then 2
      when exists (
        select 1
        from unnest(coalesce(p.alternate_names, '{}'::text[])) as alt_name
        where alt_name ilike '%' || i.term || '%'
      ) then 3
      when p.market_key ilike '%' || i.term || '%' then 4
      else 5
    end,
    p.name asc nulls last,
    p.id asc
  limit (select limit_count from input);
$$;
grant execute on function public.search_properties_tyg(text, integer) to anon, authenticated, service_role;
comment on function public.search_properties_tyg(text, integer) is
  'Searches propertiesTYG by current name, alternate_names, market key, ids, and exact numeric bed/unit counts.';

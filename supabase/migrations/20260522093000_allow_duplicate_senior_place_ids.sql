drop index if exists public."seniorPropertiesTYG_place_id_uidx";
drop index if exists public."seniorPropertiesTYG_placeId_uidx";
create index if not exists "seniorPropertiesTYG_place_id_idx"
  on public."seniorPropertiesTYG" (place_id);
create index if not exists "seniorPropertiesTYG_placeId_idx"
  on public."seniorPropertiesTYG" ("placeId");

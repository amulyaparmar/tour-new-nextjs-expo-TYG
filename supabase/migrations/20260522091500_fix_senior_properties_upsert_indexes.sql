drop index if exists public."seniorPropertiesTYG_location_id_uidx";
drop index if exists public."seniorPropertiesTYG_place_id_uidx";
drop index if exists public."seniorPropertiesTYG_placeId_uidx";
create unique index if not exists "seniorPropertiesTYG_location_id_uidx"
  on public."seniorPropertiesTYG" (location_id);
create unique index if not exists "seniorPropertiesTYG_place_id_uidx"
  on public."seniorPropertiesTYG" (place_id);
create unique index if not exists "seniorPropertiesTYG_placeId_uidx"
  on public."seniorPropertiesTYG" ("placeId");

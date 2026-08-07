-- Remap catalog_items: lifestyle_themes → merchandise themes; recommended_channels → primary codes.

-- 1) Move legacy CRM codes from lifestyle_themes into recommended_channels (as new primaries)
update catalog_items
set recommended_channels = (
  select coalesce(jsonb_agg(to_jsonb(mapped) order by ord), '[]'::jsonb)
  from (
    select
      ord,
      case value
        when 'Golf' then 'golf_retail'
        when 'Marina' then 'marine_retail'
        when 'Hardware' then 'hardware_farm_rural'
        when 'Resort Gift' then 'gift_novelty_souvenir'
        when 'golf_retail' then 'golf_retail'
        when 'marine_retail' then 'marine_retail'
        when 'hardware_farm_rural' then 'hardware_farm_rural'
        when 'gift_novelty_souvenir' then 'gift_novelty_souvenir'
        when 'apparel_specialty' then 'apparel_specialty'
        when 'resort_hospitality' then 'resort_hospitality'
        when 'fishing_fly_tackle' then 'fishing_fly_tackle'
        when 'outdoor_camping_hunting' then 'outdoor_camping_hunting'
        else null
      end as mapped
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(lifestyle_themes) = 'array' then lifestyle_themes
        else '[]'::jsonb
      end
    ) with ordinality as t(value, ord)
  ) s
  where mapped is not null
)
where lifestyle_themes <> '[]'::jsonb
  and (
    lifestyle_themes ? 'Golf'
    or lifestyle_themes ? 'Marina'
    or lifestyle_themes ? 'Hardware'
    or lifestyle_themes ? 'Resort Gift'
  );

-- 2) Rebuild lifestyle_themes from name + tagline (merchandise themes)
with scored as (
  select
    ci.id,
    lower(coalesce(ci.name, '') || ' ' || coalesce(ci.tagline, '')) as hay
  from catalog_items ci
  join lines l on l.id = ci.line_id
  where l.code = 'ogr'
),
built as (
  select
    id,
    jsonb_strip_nulls(
      jsonb_build_array(
        case when hay ~ 'golf|swing|fairway|best round|19th hole|putt' then 'golf' end,
        case when hay ~ 'fish|hookin|reel|tackle|chasing tail|catch' then 'fishing' end,
        case when hay ~ 'boat|marina|sail|dock|pirate|mariner|salty|captain' then 'boating' end,
        case when hay ~ 'camp|camper|tent|trail' then 'camping' end,
        case when hay ~ 'rv|motorhome|how i roll' then 'rv_travel' end,
        case when hay ~ 'retirement|retired|getting older|decades|aged|classic' then 'retirement' end,
        case when hay ~ 'grill|bbq|barbecue' then 'bbq' end,
        case when hay ~ 'beer|brew|ale|lager' then 'beer' end,
        case when hay ~ 'motorcycl|chopper|harley|ride|gears' then 'motorcycles' end,
        case when hay ~ 'muscle|shelby|classic car|hot rod' then 'classic_cars' end,
        case when hay ~ 'truck|garage|wrench|octane|roadhouse|built not bought|camo' then 'trucks_garage' end,
        case when hay ~ 'surf|beach|hammock|palm|vacation|aloha|island|cruiser' then 'surf_beach' end,
        case when hay ~ 'grandpa|grandad|gramps' then 'grandpa' end,
        case when hay ~ 'look good|glasses|legend|expert|dream|bucket list|disgracefully' then 'general_humor' end,
        case when hay ~ 'canada|canadian|maple|destination|freedom|usa|born|flag|veteran' then 'canadian_destination' end
      )
    ) as themes
  from scored
),
final as (
  select
    id,
    case
      when themes = '[]'::jsonb or themes is null then '["general_humor"]'::jsonb
      else themes
    end as themes
  from built
)
update catalog_items ci
set lifestyle_themes = final.themes
from final
where ci.id = final.id;

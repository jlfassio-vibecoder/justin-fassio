-- Re-tag all OGR catalog lifestyle_themes from name + tagline (CRM channel codes).
-- Expanded keyword coverage + Resort Gift default so every style is filterable.
-- Mirrors into recommended_channels. Keep in sync with src/lib/retailChannels.ts.

with ogr as (
  select
    ci.id,
    lower(coalesce(ci.name, '') || ' ' || coalesce(ci.tagline, '')) as hay
  from catalog_items ci
  join lines l on l.id = ci.line_id
  where l.code = 'ogr'
),
scored as (
  select
    id,
    case
      when hay ~
        'golf|fairway|tee time|links|still swing|swinging|best round|19th hole|nineteenth hole|putt|par |birdie'
      then 1 else 0
    end as golf,
    case
      when hay ~
        'boat|marina|dock|sail|fish|tackle|lake|ocean|beach cruiser|hookin|hooking|reel|chasing tail|pirate|mariner|crab|surf|salty|anchor|captain|harbor|harbour'
      then 1 else 0
    end as marina,
    case
      when hay ~
        'truck|wrench|farm|garage|workaholic|beer|grill|bbq|muscle|dog|lab |veteran|flag|usa|octane|iron &|built not bought|camo|roadhouse|poker|oak cask|crazy beer|leash|how i roll|ride|gears|road|king of road|big red|shelby'
      then 1 else 0
    end as hardware,
    case
      when hay ~
        'vacation|hammock|palm|beach|retirement|grandpa|classic|getting older|decades|aged|perfection|living legend|local legend|look good|glasses|opv|american dream|american revival|american legend|freedom|born|bucket list|dream|aloha|island|camper|lounge|legend|older|better i was|rock|disgracefully|expert|beanie|dad cap|mug|magnet|metal sign|sticker'
      then 1 else 0
    end as resort_gift
  from ogr
),
built as (
  select
    id,
    jsonb_strip_nulls(
      jsonb_build_array(
        case when golf = 1 then 'Golf' end,
        case when marina = 1 then 'Marina' end,
        case when hardware = 1 then 'Hardware' end,
        case when resort_gift = 1 then 'Resort Gift' end
      )
    ) as channels
  from scored
),
final as (
  select
    id,
    case
      when channels = '[]'::jsonb or channels is null then '["Resort Gift"]'::jsonb
      else channels
    end as channels
  from built
)
update catalog_items ci
set
  lifestyle_themes = final.channels,
  recommended_channels = final.channels
from final
where ci.id = final.id;

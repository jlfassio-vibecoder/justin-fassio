-- Backfill OGR catalog lifestyle_themes (CRM retail channel codes) from garment copy.
-- Codes: Golf | Marina | Hardware | Resort Gift — mirrored to recommended_channels.
-- Only fills empty lifestyle_themes so later staff edits are preserved.
-- Keyword rules kept in sync with src/lib/retailChannels.ts RETAIL_CHANNEL_INFER_RULES.

with ogr as (
  select
    ci.id,
    lower(
      coalesce(ci.name, '') || ' ' || coalesce(ci.tagline, '') || ' ' || coalesce(ci.sales_description, '')
    ) as hay
  from catalog_items ci
  join lines l on l.id = ci.line_id
  where l.code = 'ogr'
    and ci.lifestyle_themes = '[]'::jsonb
),
scored as (
  select
    id,
    (
      case when hay ~ 'golf|fairway|tee time|links|still swing|swinging' then 1 else 0 end
    ) as golf,
    (
      case when hay ~ 'boat|marina|dock|sail|fish|tackle|lake|ocean|beach cruiser' then 1 else 0 end
    ) as marina,
    (
      case when hay ~
        'truck|wrench|farm|garage|workaholic|beer|grill|bbq|muscle|dog|veteran|flag|usa|octane|iron &|built not bought|camo|roadhouse|poker|oak cask|crazy beer|leash'
        then 1
        else 0
      end
    ) as hardware,
    (
      case when hay ~
        'vacation|hammock|palm|beach|retirement|grandpa|classic|getting older|decades|aged|perfection|living legend|local legend|look good|glasses|opv|american dream|american revival|freedom|born'
        then 1
        else 0
      end
    ) as resort_gift
  from ogr
),
built as (
  select
    id,
    jsonb_build_array(
      case when golf = 1 then 'Golf' end,
      case when marina = 1 then 'Marina' end,
      case when hardware = 1 then 'Hardware' end,
      case when resort_gift = 1 then 'Resort Gift' end
    ) as channels
  from scored
  where golf + marina + hardware + resort_gift > 0
),
cleaned as (
  select
    id,
    (
      select jsonb_agg(value order by ord)
      from jsonb_array_elements_text(channels) with ordinality as t(value, ord)
      where value is not null
    ) as channels
  from built
)
update catalog_items ci
set
  lifestyle_themes = cleaned.channels,
  recommended_channels = cleaned.channels
from cleaned
where ci.id = cleaned.id
  and cleaned.channels is not null
  and jsonb_array_length(cleaned.channels) > 0;

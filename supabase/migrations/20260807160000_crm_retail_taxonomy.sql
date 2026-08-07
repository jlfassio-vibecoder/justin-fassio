-- Full CRM retail taxonomy on prospects + remapped catalog themes/channels.
-- category stores PrimaryRetailChannel codes (was Golf|Marina|Hardware|Resort Gift).

alter table prospects
  add column if not exists secondary_channels jsonb not null default '[]'::jsonb,
  add column if not exists retail_subchannels jsonb not null default '[]'::jsonb,
  add column if not exists venue_contexts jsonb not null default '[]'::jsonb,
  add column if not exists lifestyle_themes jsonb not null default '[]'::jsonb,
  add column if not exists retail_capabilities jsonb not null default '[]'::jsonb;

-- Backfill category → new primary codes (retail_category refinements applied after)
update prospects
set category = case category
  when 'Golf' then 'golf_retail'
  when 'Marina' then 'marine_retail'
  when 'Hardware' then 'hardware_farm_rural'
  when 'Resort Gift' then 'gift_novelty_souvenir'
  else category
end
where category in ('Golf', 'Marina', 'Hardware', 'Resort Gift');

-- Prefer retail_category sheet labels when they imply a better primary
update prospects
set category = 'golf_retail'
where retail_category ilike '%golf%'
  and category in ('gift_novelty_souvenir', 'other', 'hardware_farm_rural', 'marine_retail');

update prospects
set category = 'marine_retail'
where (retail_category ilike '%marina%' or retail_category ilike '%marine%')
  and category in ('gift_novelty_souvenir', 'other');

update prospects
set category = 'fishing_fly_tackle'
where (
  retail_category ilike '%fishing%'
  or retail_category ilike '%tackle%'
  or retail_category ilike '%fly%'
);

update prospects
set category = 'outdoor_camping_hunting'
where (
  retail_category ilike '%outdoor%'
  or retail_category ilike '%camping%'
  or retail_category ilike '%hunting%'
)
  and category not in ('fishing_fly_tackle', 'marine_retail', 'golf_retail');

update prospects
set category = 'hardware_farm_rural'
where (
  retail_category ilike '%hardware%'
  or retail_category ilike '%farm%'
);

update prospects
set category = 'resort_hospitality'
where (
  retail_category ilike '%resort%'
  or retail_category ilike '%lodge%'
  or retail_category ilike '%hotel%'
)
  and category = 'gift_novelty_souvenir';

update prospects
set category = 'apparel_specialty'
where (
  retail_category ilike '%apparel%'
  or retail_category ilike '%clothing%'
  or retail_category ilike '%mens%'
);

create index if not exists prospects_category_primary_idx on prospects (category);

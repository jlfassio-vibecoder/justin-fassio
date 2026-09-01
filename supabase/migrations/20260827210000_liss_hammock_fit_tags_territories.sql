-- Tag Go Hammock for product-match + seed proposed LIS sales_line_territories (bc/or/wa/ca).

update catalog_items c
set
  lifestyle_themes = coalesce(c.lifestyle_themes, '[]'::jsonb) || '["surf_beach","camping"]'::jsonb,
  recommended_channels = coalesce(c.recommended_channels, '[]'::jsonb)
    || '["outdoor_camping_hunting","gift_novelty_souvenir","resort_hospitality","marine_retail"]'::jsonb,
  updated_at = now()
from lines l
where c.line_id = l.id
  and l.code = 'living-in-sunshine'
  and c.sku = 'LIS-GO-HAMMOCK';

-- Deduplicate theme/channel arrays if migration re-run (keep unique jsonb array elements).
update catalog_items c
set
  lifestyle_themes = (
    select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
    from jsonb_array_elements_text(c.lifestyle_themes) as t(e)
  ),
  recommended_channels = (
    select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
    from jsonb_array_elements_text(c.recommended_channels) as t(e)
  ),
  updated_at = now()
from lines l
where c.line_id = l.id
  and l.code = 'living-in-sunshine'
  and c.sku = 'LIS-GO-HAMMOCK';

insert into sales_line_territories (
  sales_line_id,
  territory_id,
  rights_type,
  status,
  notes
)
select
  l.id,
  t.id,
  'unconfirmed',
  'proposed',
  'LIS Go Hammock book: proposed rights for BC/OR/WA/CA (CA from northern OC north)'
from lines l
cross join territories t
where l.code = 'living-in-sunshine'
  and t.code in ('bc', 'or', 'wa', 'ca')
  and not exists (
    select 1
    from sales_line_territories slt
    where slt.sales_line_id = l.id
      and slt.territory_id = t.id
      and slt.status <> 'expired'
  );

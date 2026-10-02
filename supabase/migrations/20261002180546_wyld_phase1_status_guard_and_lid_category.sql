-- Close the relationship-status write gap and correct the Wyld lid category.
-- Notes and other metadata updates stay unguarded.

drop trigger if exists retailer_line_accounts_operational_write_guard on public.retailer_line_accounts;
create trigger retailer_line_accounts_operational_write_guard
  before insert or update of sales_line_id, relationship_status
  on public.retailer_line_accounts
  for each row execute function public.enforce_rla_operational_write_not_blocked();

update public.catalog_products p
set
  category = 'Accessories',
  updated_at = now()
from public.lines l
where p.line_id = l.id
  and l.code = 'wyld-gear'
  and p.family_key = 'wyld-cup-straw-lid-24oz-and-30oz-wt'
  and p.category is distinct from 'Accessories';

update public.catalog_items i
set
  cat = 'Accessories',
  department = 'Accessories',
  updated_at = now()
from public.lines l
where i.line_id = l.id
  and l.code = 'wyld-gear'
  and i.sku = 'WSL-24-30'
  and (i.cat is distinct from 'Accessories' or i.department is distinct from 'Accessories');

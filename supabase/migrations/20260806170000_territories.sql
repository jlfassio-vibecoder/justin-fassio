-- First-class sales territories (BC, AB, CA, OR, WA) and prospect.territory_id FK.
-- Existing prospects backfill to British Columbia. Intra-territory geography
-- (region / primary_district / subterritory) is unchanged.

create table if not exists territories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_code text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territories_code_check check (code in ('bc', 'ab', 'ca', 'or', 'wa')),
  constraint territories_country_code_check check (country_code in ('CA', 'US'))
);

drop trigger if exists territories_set_updated_at on territories;
create trigger territories_set_updated_at
  before update on territories
  for each row execute function set_updated_at();

insert into territories (code, name, country_code, sort_order, active)
values
  ('bc', 'British Columbia', 'CA', 10, true),
  ('ab', 'Alberta', 'CA', 20, true),
  ('ca', 'California', 'US', 30, true),
  ('or', 'Oregon', 'US', 40, true),
  ('wa', 'Washington', 'US', 50, true)
on conflict (code) do nothing;

alter table prospects
  add column if not exists territory_id uuid references territories (id);

update prospects
set territory_id = (select id from territories where code = 'bc' limit 1)
where territory_id is null;

alter table prospects
  alter column territory_id set not null;

create index if not exists prospects_territory_id_idx on prospects (territory_id);

alter table territories enable row level security;

drop policy if exists "approved staff full access" on territories;
create policy "approved staff full access" on territories
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

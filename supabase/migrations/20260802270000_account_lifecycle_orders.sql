-- Prospect → Active Account lifecycle: status columns, orders, reorder settings.
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP IF EXISTS / named constraints).

-- ─────────────────────────────────────────────────────────────────────────
-- prospects — lifecycle status + conversion metadata
-- ─────────────────────────────────────────────────────────────────────────

alter table prospects
  add column if not exists account_status text not null default 'prospect';

alter table prospects
  add column if not exists converted_at timestamptz;

alter table prospects
  add column if not exists initial_order_date timestamptz;

alter table prospects
  drop constraint if exists prospects_account_status_check;

alter table prospects
  add constraint prospects_account_status_check
  check (account_status in ('prospect', 'active_account', 'inactive'));

create index if not exists prospects_account_status_idx on prospects (account_status);

-- ─────────────────────────────────────────────────────────────────────────
-- orders — initial / reorder / preorder history per account (prospects.id)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  account_id integer not null references prospects (id),
  line_id uuid references lines (id) on delete set null,
  order_type text not null,
  season text not null,
  order_date date not null default current_date,
  total_amount_cad numeric(10, 2) not null default 0,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table orders
  drop constraint if exists orders_order_type_check;

alter table orders
  add constraint orders_order_type_check
  check (order_type in ('initial', 'reorder', 'preorder'));

alter table orders
  drop constraint if exists orders_season_check;

alter table orders
  add constraint orders_season_check
  check (season in (
    'spring_summer',
    'fathers_day',
    'fall_winter',
    'holiday_christmas',
    'ats_in_season'
  ));

alter table orders
  drop constraint if exists orders_status_check;

alter table orders
  add constraint orders_status_check
  check (status in ('draft', 'submitted', 'fulfilled'));

create index if not exists orders_account_id_idx on orders (account_id);
create index if not exists orders_order_date_idx on orders (order_date);
create index if not exists orders_season_idx on orders (season);

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

alter table orders enable row level security;

drop policy if exists "approved staff full access" on orders;
create policy "approved staff full access" on orders
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_reorder_settings — 1:1 cadence / AI reminder fields per account
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_reorder_settings (
  account_id integer primary key references prospects (id) on delete cascade,
  last_order_date date,
  next_suggested_contact_date date,
  seasonal_cadence_tags text[] not null default '{}',
  ai_reorder_notes text,
  updated_at timestamptz not null default now()
);

drop trigger if exists account_reorder_settings_set_updated_at on account_reorder_settings;
create trigger account_reorder_settings_set_updated_at
  before update on account_reorder_settings
  for each row execute function set_updated_at();

alter table account_reorder_settings enable row level security;

drop policy if exists "approved staff full access" on account_reorder_settings;
create policy "approved staff full access" on account_reorder_settings
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

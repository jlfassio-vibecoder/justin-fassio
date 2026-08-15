-- Phase 1A: Multi-line / multi-territory additive schema foundation.
-- Creates principals, extends lines/territories, line-account tables, transitional
-- FKs, financial columns, derived views, enforcement triggers, and RLS.
-- Does NOT backfill retailer_line_accounts or dual-write from prospects.

-- ─────────────────────────────────────────────────────────────────────────
-- principals
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists principals (
  id uuid primary key default gen_random_uuid(),
  legal_name text,
  dba_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists principals_set_updated_at on principals;
create trigger principals_set_updated_at
  before update on principals
  for each row execute function set_updated_at();

alter table principals enable row level security;

drop policy if exists "approved staff full access" on principals;
create policy "approved staff full access" on principals
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- lines — extend with status / principal / commercial fields
-- Default status 'active' protects existing ogr/bkg rows until seeds refine.
-- Seeds migration sets default to 'prospective' for future inserts + combined CHECK.
-- ─────────────────────────────────────────────────────────────────────────

alter table lines
  add column if not exists principal_id uuid references principals (id) on delete set null;

alter table lines
  add column if not exists status text;

update lines
set status = 'active'
where status is null;

alter table lines
  alter column status set default 'active';

alter table lines
  alter column status set not null;

alter table lines
  drop constraint if exists lines_status_check;

alter table lines
  add constraint lines_status_check
  check (status in (
    'prospective',
    'confirmed',
    'onboarding',
    'active',
    'paused',
    'declined',
    'terminated'
  ));

alter table lines
  add column if not exists acquisition_stage text;

alter table lines
  drop constraint if exists lines_acquisition_stage_check;

alter table lines
  add constraint lines_acquisition_stage_check
  check (
    acquisition_stage is null
    or acquisition_stage in (
      'identified',
      'researching',
      'contact_requested',
      'conversation',
      'evaluating',
      'negotiating',
      'decision_pending'
    )
  );

alter table lines
  add column if not exists default_currency text;

alter table lines
  add column if not exists commission_rate numeric(5, 4);

alter table lines
  add column if not exists effective_date date;

alter table lines
  add column if not exists termination_date date;

alter table lines
  add column if not exists productivity_thresholds jsonb;

create index if not exists lines_principal_id_idx on lines (principal_id);
create index if not exists lines_status_idx on lines (status);

-- ─────────────────────────────────────────────────────────────────────────
-- territories — hierarchical geo (keep existing bc/ab/ca/or/wa ids)
-- ─────────────────────────────────────────────────────────────────────────

alter table territories
  drop constraint if exists territories_code_check;

alter table territories
  add column if not exists level text;

update territories
set level = 'province_state'
where level is null;

alter table territories
  alter column level set default 'province_state';

alter table territories
  alter column level set not null;

alter table territories
  drop constraint if exists territories_level_check;

alter table territories
  add constraint territories_level_check
  check (level in ('country', 'province_state', 'region', 'county'));

alter table territories
  add column if not exists parent_territory_id uuid references territories (id);

alter table territories
  add column if not exists status text;

update territories
set status = 'active'
where status is null;

alter table territories
  alter column status set default 'active';

alter table territories
  alter column status set not null;

alter table territories
  drop constraint if exists territories_status_check;

alter table territories
  add constraint territories_status_check
  check (status in ('active', 'proposed'));

alter table territories
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists territories_parent_territory_id_idx
  on territories (parent_territory_id);

create index if not exists territories_level_idx on territories (level);

-- ─────────────────────────────────────────────────────────────────────────
-- sales_line_territories
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists sales_line_territories (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references lines (id) on delete cascade,
  territory_id uuid not null references territories (id),
  rights_type text not null
    check (rights_type in (
      'exclusive',
      'limited_exclusive',
      'non_exclusive',
      'unconfirmed'
    )),
  status text not null
    check (status in ('proposed', 'active', 'expired', 'disputed')),
  effective_date date,
  expiration_date date,
  contract_source text,
  restrictions jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_line_territories_id_sales_line_uidx unique (id, sales_line_id)
);

create unique index if not exists sales_line_territories_line_territory_active_uidx
  on sales_line_territories (sales_line_id, territory_id)
  where status <> 'expired';

create index if not exists sales_line_territories_sales_line_id_idx
  on sales_line_territories (sales_line_id);

create index if not exists sales_line_territories_territory_id_idx
  on sales_line_territories (territory_id);

drop trigger if exists sales_line_territories_set_updated_at on sales_line_territories;
create trigger sales_line_territories_set_updated_at
  before update on sales_line_territories
  for each row execute function set_updated_at();

alter table sales_line_territories enable row level security;

drop policy if exists "approved staff full access" on sales_line_territories;
create policy "approved staff full access" on sales_line_territories
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_line_accounts
-- Composite FK enforces same-line territory assignment (MATCH SIMPLE for null).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists retailer_line_accounts (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  sales_line_id uuid not null references lines (id),
  sales_line_territory_id uuid,
  relationship_status text not null
    check (relationship_status in (
      'prospect',
      'qualified',
      'opened',
      'inactive',
      'terminated'
    )),
  converted_at timestamptz,
  initial_order_date timestamptz,
  notes text,
  fit text,
  fit_score smallint check (fit_score is null or (fit_score >= 1 and fit_score <= 10)),
  ideal_opening_units integer,
  priority text,
  provisional_grade text,
  verification_status text,
  buyer_verified boolean not null default false,
  apparel_capability text,
  existing_ogr text,
  qualification_status text,
  next_action text,
  source_note text,
  region text,
  primary_district text,
  subterritory text,
  secondary_channels jsonb not null default '[]'::jsonb,
  retail_subchannels jsonb not null default '[]'::jsonb,
  venue_contexts jsonb not null default '[]'::jsonb,
  lifestyle_themes jsonb not null default '[]'::jsonb,
  retail_capabilities jsonb not null default '[]'::jsonb,
  backfill_review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_line_accounts_territory_same_line_fkey
    foreign key (sales_line_territory_id, sales_line_id)
    references sales_line_territories (id, sales_line_id)
    match simple
);

create unique index if not exists retailer_line_accounts_retailer_line_operational_uidx
  on retailer_line_accounts (retailer_id, sales_line_id)
  where relationship_status <> 'terminated';

create index if not exists retailer_line_accounts_sales_line_status_idx
  on retailer_line_accounts (sales_line_id, relationship_status);

create index if not exists retailer_line_accounts_retailer_id_idx
  on retailer_line_accounts (retailer_id);

drop trigger if exists retailer_line_accounts_set_updated_at on retailer_line_accounts;
create trigger retailer_line_accounts_set_updated_at
  before update on retailer_line_accounts
  for each row execute function set_updated_at();

alter table retailer_line_accounts enable row level security;

drop policy if exists "approved staff full access" on retailer_line_accounts;
create policy "approved staff full access" on retailer_line_accounts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_line_contacts
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists retailer_line_contacts (
  id uuid primary key default gen_random_uuid(),
  retailer_line_account_id uuid not null
    references retailer_line_accounts (id) on delete cascade,
  account_contact_id uuid not null
    references account_contacts (id) on delete cascade,
  role text not null
    check (role in ('buyer', 'manager', 'owner')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_line_contacts_account_contact_uidx
    unique (retailer_line_account_id, account_contact_id)
);

create unique index if not exists retailer_line_contacts_one_primary_uidx
  on retailer_line_contacts (retailer_line_account_id)
  where is_primary;

create index if not exists retailer_line_contacts_account_contact_id_idx
  on retailer_line_contacts (account_contact_id);

drop trigger if exists retailer_line_contacts_set_updated_at on retailer_line_contacts;
create trigger retailer_line_contacts_set_updated_at
  before update on retailer_line_contacts
  for each row execute function set_updated_at();

alter table retailer_line_contacts enable row level security;

drop policy if exists "approved staff full access" on retailer_line_contacts;
create policy "approved staff full access" on retailer_line_contacts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_field_changes (writers land in Phase 4)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists retailer_field_changes (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'user'
    check (source in ('user', 'ai', 'import', 'calculated', 'unknown')),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists retailer_field_changes_retailer_id_idx
  on retailer_field_changes (retailer_id, created_at desc);

alter table retailer_field_changes enable row level security;

drop policy if exists "approved staff full access" on retailer_field_changes;
create policy "approved staff full access" on retailer_field_changes
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_line_targets (research-only; prospective lines only via trigger)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists retailer_line_targets (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  sales_line_id uuid not null references lines (id) on delete cascade,
  interest text,
  fit_notes text,
  suggested_geo text,
  status text not null default 'watching'
    check (status in ('watching', 'shortlist', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_line_targets_retailer_line_uidx unique (retailer_id, sales_line_id)
);

create index if not exists retailer_line_targets_sales_line_id_idx
  on retailer_line_targets (sales_line_id);

drop trigger if exists retailer_line_targets_set_updated_at on retailer_line_targets;
create trigger retailer_line_targets_set_updated_at
  before update on retailer_line_targets
  for each row execute function set_updated_at();

alter table retailer_line_targets enable row level security;

drop policy if exists "approved staff full access" on retailer_line_targets;
create policy "approved staff full access" on retailer_line_targets
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- Note (v1 RLS limitation): prospective-line owner/admin restriction is deferred
-- to Phase 8 UI/API. New tables use staff-wide is_approved_staff() like the rest
-- of the CRM. Do not invent a parallel multi-user role system here.

-- ─────────────────────────────────────────────────────────────────────────
-- migration_review_queue (Phase 1B backfill uses this; structure only in 1A)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists migration_review_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists migration_review_queue_unresolved_idx
  on migration_review_queue (entity_type, created_at)
  where resolved_at is null;

alter table migration_review_queue enable row level security;

drop policy if exists "approved staff full access" on migration_review_queue;
create policy "approved staff full access" on migration_review_queue
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- Transitional nullable retailer_line_account_id on operational tables
-- ─────────────────────────────────────────────────────────────────────────

alter table orders
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

alter table orders
  add column if not exists original_amount numeric(12, 2);

alter table orders
  add column if not exists original_currency text;

alter table orders
  add column if not exists exchange_rate numeric(18, 8);

alter table orders
  add column if not exists exchange_rate_date date;

alter table orders
  add column if not exists converted_amount numeric(12, 2);

alter table orders
  add column if not exists converted_currency text;

alter table orders
  add column if not exists conversion_source text;

create index if not exists orders_retailer_line_account_id_idx
  on orders (retailer_line_account_id);

alter table calls
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

alter table calls
  add column if not exists order_value_original_amount numeric(12, 2);

alter table calls
  add column if not exists order_value_original_currency text;

alter table calls
  add column if not exists order_value_exchange_rate numeric(18, 8);

alter table calls
  add column if not exists order_value_exchange_rate_date date;

alter table calls
  add column if not exists order_value_converted_amount numeric(12, 2);

alter table calls
  add column if not exists order_value_converted_currency text;

alter table calls
  add column if not exists order_value_conversion_source text;

create index if not exists calls_retailer_line_account_id_idx
  on calls (retailer_line_account_id);

alter table system_messages
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists system_messages_retailer_line_account_id_idx
  on system_messages (retailer_line_account_id);

alter table account_reorder_settings
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists account_reorder_settings_retailer_line_account_id_idx
  on account_reorder_settings (retailer_line_account_id);

alter table gmail_thread_links
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists gmail_thread_links_retailer_line_account_id_idx
  on gmail_thread_links (retailer_line_account_id);

alter table calendar_event_links
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists calendar_event_links_retailer_line_account_id_idx
  on calendar_event_links (retailer_line_account_id);

alter table message_threads
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists message_threads_retailer_line_account_id_idx
  on message_threads (retailer_line_account_id);

alter table wholesale_order_requests
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists wholesale_order_requests_retailer_line_account_id_idx
  on wholesale_order_requests (retailer_line_account_id);

alter table account_conversion_attribution
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists account_conversion_attribution_rla_idx
  on account_conversion_attribution (retailer_line_account_id);

-- Nullable stamp column only; do NOT add prospect_id FK in Phase 1A.
alter table prospect_updates
  add column if not exists retailer_line_account_id uuid
    references retailer_line_accounts (id) on delete set null;

create index if not exists prospect_updates_retailer_line_account_id_idx
  on prospect_updates (retailer_line_account_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Derived views: activity_status and productivity_class (not stored columns)
-- ─────────────────────────────────────────────────────────────────────────

create or replace view retailer_line_account_activity as
select
  rla.id as retailer_line_account_id,
  case
    when not exists (
      select 1
      from orders o
      where o.retailer_line_account_id = rla.id
        and o.status <> 'draft'
    ) then 'never_ordered'
    when exists (
      select 1
      from orders o
      where o.retailer_line_account_id = rla.id
        and o.status <> 'draft'
        and o.order_date >= (current_date - 365)
    ) then 'active'
    else 'dormant'
  end as activity_status
from retailer_line_accounts rla;

create or replace view retailer_line_account_productivity as
select
  rla.id as retailer_line_account_id,
  case
    when l.productivity_thresholds is null then 'unclassified'
    else 'unclassified'
  end as productivity_class
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id;

-- Productivity thresholds remain null in Phase 1A; classification stays unclassified
-- until line-specific thresholds are configured (view placeholder for expand/contract).

-- ─────────────────────────────────────────────────────────────────────────
-- Enforcement triggers (cannot be expressed as cross-table CHECK)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_retailer_line_target_prospective()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  select status into line_status
  from lines
  where id = new.sales_line_id;

  if line_status is null then
    raise exception 'retailer_line_targets: sales_line_id % not found', new.sales_line_id;
  end if;

  if line_status <> 'prospective' then
    raise exception
      'retailer_line_targets may only reference prospective lines (got status %)',
      line_status;
  end if;

  return new;
end;
$$;

drop trigger if exists retailer_line_targets_prospective_only on retailer_line_targets;
create trigger retailer_line_targets_prospective_only
  before insert or update of sales_line_id on retailer_line_targets
  for each row execute function public.enforce_retailer_line_target_prospective();

create or replace function public.enforce_retailer_line_account_not_prospective()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  select status into line_status
  from lines
  where id = new.sales_line_id;

  if line_status is null then
    raise exception 'retailer_line_accounts: sales_line_id % not found', new.sales_line_id;
  end if;

  if line_status = 'prospective' then
    raise exception
      'retailer_line_accounts cannot be created for prospective lines';
  end if;

  return new;
end;
$$;

drop trigger if exists retailer_line_accounts_not_prospective on retailer_line_accounts;
create trigger retailer_line_accounts_not_prospective
  before insert or update of sales_line_id on retailer_line_accounts
  for each row execute function public.enforce_retailer_line_account_not_prospective();

create or replace function public.enforce_order_not_prospective_line()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  if new.retailer_line_account_id is not null then
    select l.status into line_status
    from retailer_line_accounts rla
    join lines l on l.id = rla.sales_line_id
    where rla.id = new.retailer_line_account_id;

    if line_status = 'prospective' then
      raise exception 'orders cannot reference prospective-line accounts';
    end if;
  end if;

  if new.line_id is not null then
    select status into line_status
    from lines
    where id = new.line_id;

    if line_status = 'prospective' then
      raise exception 'orders.line_id cannot reference a prospective line';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_not_prospective_line on orders;
create trigger orders_not_prospective_line
  before insert or update of retailer_line_account_id, line_id on orders
  for each row execute function public.enforce_order_not_prospective_line();

create or replace function public.enforce_system_message_not_prospective_line()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  -- All current system_messages are product_outreach; block prospective line accounts.
  if new.retailer_line_account_id is not null then
    select l.status into line_status
    from retailer_line_accounts rla
    join lines l on l.id = rla.sales_line_id
    where rla.id = new.retailer_line_account_id;

    if line_status = 'prospective' then
      raise exception 'system_messages cannot reference prospective-line accounts';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists system_messages_not_prospective_line on system_messages;
create trigger system_messages_not_prospective_line
  before insert or update of retailer_line_account_id on system_messages
  for each row execute function public.enforce_system_message_not_prospective_line();

-- Phase 1 bulk-import data foundation: markers, postal_code, import_protected,
-- import/enrich tables, field-change pending columns, activity-view historical branch.
-- Additive only. Do not rewrite dual-write triggers or historical migrations.
-- Do not set line_account_markers from ensure_ogr_retailer_line_account_from_prospect.

-- ─────────────────────────────────────────────────────────────────────────
-- prospects identity (shared across lines)
-- ─────────────────────────────────────────────────────────────────────────

alter table prospects
  add column if not exists postal_code text;

alter table prospects
  add column if not exists import_protected boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_line_accounts markers (not relationship_status; not dual-written)
-- ─────────────────────────────────────────────────────────────────────────

alter table retailer_line_accounts
  add column if not exists line_account_markers text[] not null default '{}';

alter table retailer_line_accounts
  drop constraint if exists retailer_line_accounts_line_account_markers_check;
alter table retailer_line_accounts
  add constraint retailer_line_accounts_line_account_markers_check
  check (
    line_account_markers <@ array[
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive'
    ]::text[]
  );

create index if not exists retailer_line_accounts_line_account_markers_gin
  on retailer_line_accounts using gin (line_account_markers);

-- ─────────────────────────────────────────────────────────────────────────
-- Activity view: historical_purchaser with no ledger is dormant, not never_ordered.
-- Do not store activity_status. Productivity view unchanged.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view retailer_line_account_activity as
select
  rla.id as retailer_line_account_id,
  case
    when exists (
      select 1
      from orders o
      where o.retailer_line_account_id = rla.id
        and o.status <> 'draft'
        and o.order_date >= (current_date - 365)
    ) then 'active'
    when exists (
      select 1
      from orders o
      where o.retailer_line_account_id = rla.id
        and o.status <> 'draft'
    ) then 'dormant'
    when 'historical_purchaser' = any (rla.line_account_markers) then 'dormant'
    else 'never_ordered'
  end as activity_status
from retailer_line_accounts rla;

-- ─────────────────────────────────────────────────────────────────────────
-- account_import_batches
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_import_batches (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references lines (id),
  source_type text not null
    check (source_type in (
      'historical_customer',
      'faire_customer',
      'zoominfo_lead',
      'research_prospect',
      'other'
    )),
  source_filename text not null,
  content_sha256 text,
  status text not null default 'previewed'
    check (status in (
      'previewed',
      'committed',
      'enriching',
      'enrichment_partial',
      'completed',
      'cancelled'
    )),
  classification_snapshot jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_import_batches_line_sha_committed_uidx
  on account_import_batches (sales_line_id, content_sha256)
  where content_sha256 is not null
    and status in ('committed', 'enriching', 'enrichment_partial', 'completed');

create index if not exists account_import_batches_sales_line_id_idx
  on account_import_batches (sales_line_id);

drop trigger if exists account_import_batches_set_updated_at on account_import_batches;
create trigger account_import_batches_set_updated_at
  before update on account_import_batches
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- account_import_rows (sales_line_id denormalized for fingerprint unique)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references account_import_batches (id) on delete cascade,
  sales_line_id uuid not null references lines (id),
  row_number integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  fingerprint text,
  match_decision text not null default 'needs_review'
    check (match_decision in (
      'create_retailer',
      'link_existing',
      'update_rla',
      'in_file_duplicate',
      'prior_import_skip',
      'needs_review',
      'blocked'
    )),
  status text not null default 'previewed'
    check (status in (
      'previewed',
      'queued',
      'imported',
      'linked',
      'updated',
      'skipped',
      'failed',
      'cancelled'
    )),
  retailer_id integer references prospects (id) on delete set null,
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  error text,
  former_rep_code text,
  raw_address_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_import_rows_batch_row_uidx unique (batch_id, row_number)
);

create unique index if not exists account_import_rows_line_fingerprint_committed_uidx
  on account_import_rows (sales_line_id, fingerprint)
  where fingerprint is not null
    and status in ('imported', 'linked', 'updated');

create index if not exists account_import_rows_batch_id_idx
  on account_import_rows (batch_id);

drop trigger if exists account_import_rows_set_updated_at on account_import_rows;
create trigger account_import_rows_set_updated_at
  before update on account_import_rows
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- account_enrichment_jobs (before field-change FK)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references account_import_batches (id) on delete cascade,
  retailer_id integer not null references prospects (id) on delete cascade,
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
  mode text not null
    check (mode in ('fill-blanks', 'update')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  research_brief text,
  evidence jsonb not null default '{}'::jsonb,
  provider text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_enrichment_jobs_batch_retailer_mode_uidx
  on account_enrichment_jobs (batch_id, retailer_id, mode)
  where status <> 'cancelled';

create index if not exists account_enrichment_jobs_batch_id_idx
  on account_enrichment_jobs (batch_id);

drop trigger if exists account_enrichment_jobs_set_updated_at on account_enrichment_jobs;
create trigger account_enrichment_jobs_set_updated_at
  before update on account_enrichment_jobs
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- retailer_field_changes pending/provenance (default applied keeps AI apply)
-- ─────────────────────────────────────────────────────────────────────────

alter table retailer_field_changes
  add column if not exists status text not null default 'applied';

alter table retailer_field_changes
  drop constraint if exists retailer_field_changes_status_check;
alter table retailer_field_changes
  add constraint retailer_field_changes_status_check
  check (status in ('pending', 'applied', 'rejected', 'superseded'));

alter table retailer_field_changes
  add column if not exists confidence text;

alter table retailer_field_changes
  add column if not exists provider text;

alter table retailer_field_changes
  add column if not exists source_urls jsonb not null default '[]'::jsonb;

alter table retailer_field_changes
  add column if not exists enrichment_job_id uuid
    references account_enrichment_jobs (id) on delete set null;

create index if not exists retailer_field_changes_enrichment_job_id_idx
  on retailer_field_changes (enrichment_job_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS: staff read, owner write. Do not change prospects / RLA / field_changes RLS.
-- ─────────────────────────────────────────────────────────────────────────

alter table account_import_batches enable row level security;
alter table account_import_rows enable row level security;
alter table account_enrichment_jobs enable row level security;

drop policy if exists "approved staff read" on account_import_batches;
create policy "approved staff read" on account_import_batches
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on account_import_batches;
create policy "approved owner write" on account_import_batches
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on account_import_rows;
create policy "approved staff read" on account_import_rows
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on account_import_rows;
create policy "approved owner write" on account_import_rows
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on account_enrichment_jobs;
create policy "approved staff read" on account_enrichment_jobs
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on account_enrichment_jobs;
create policy "approved owner write" on account_enrichment_jobs
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

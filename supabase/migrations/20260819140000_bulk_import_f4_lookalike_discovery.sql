-- F4: lookalike_prospect marker plus owner review staging tables.
-- Additive only. Do not rewrite F1 or Phase 1–4 files.
-- Discovery is not a spreadsheet source type.

alter table retailer_line_accounts
  drop constraint if exists retailer_line_accounts_line_account_markers_check;
alter table retailer_line_accounts
  add constraint retailer_line_accounts_line_account_markers_check
  check (
    line_account_markers <@ array[
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive',
      'outreach_eligible',
      'lookalike_prospect'
    ]::text[]
  );

create table if not exists lookalike_jobs (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references lines (id),
  created_by uuid not null,
  seed_retailer_ids integer[] not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'proposed', 'failed', 'cancelled')),
  trait_brief text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lookalike_jobs_sales_line_id_idx
  on lookalike_jobs (sales_line_id);

drop trigger if exists lookalike_jobs_set_updated_at on lookalike_jobs;
create trigger lookalike_jobs_set_updated_at
  before update on lookalike_jobs
  for each row execute function set_updated_at();

create table if not exists lookalike_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references lookalike_jobs (id) on delete cascade,
  name text not null,
  city text,
  state text,
  website text,
  evidence text,
  match_decision text
    check (match_decision in (
      'create_retailer',
      'link_existing',
      'update_rla',
      'in_file_duplicate',
      'prior_import_skip',
      'needs_review',
      'blocked'
    )),
  status text not null default 'proposed'
    check (status in ('proposed', 'already_in_crm', 'approved', 'rejected')),
  retailer_id integer references prospects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lookalike_candidates_job_id_idx
  on lookalike_candidates (job_id);

drop trigger if exists lookalike_candidates_set_updated_at on lookalike_candidates;
create trigger lookalike_candidates_set_updated_at
  before update on lookalike_candidates
  for each row execute function set_updated_at();

alter table lookalike_jobs enable row level security;
alter table lookalike_candidates enable row level security;

drop policy if exists "approved staff read" on lookalike_jobs;
create policy "approved staff read" on lookalike_jobs
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on lookalike_jobs;
create policy "approved owner write" on lookalike_jobs
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on lookalike_candidates;
create policy "approved staff read" on lookalike_candidates
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on lookalike_candidates;
create policy "approved owner write" on lookalike_candidates
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

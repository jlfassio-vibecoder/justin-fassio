-- Account Research PR1 schema foundation.
-- Additive only. No prospect/RLA/system_messages/catalog ALTER.
-- Source: docs/plans/agent-outreach-account-research-pr1-schema-foundation.md

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_runs (retailer-level immutable research session)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_runs (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'succeeded',
      'partial',
      'failed',
      'needs_identity_review',
      'cancelled'
    )),
  "trigger" text not null default 'manual'
    check ("trigger" in ('manual', 'prep', 'api')),
  requested_scope text not null
    check (requested_scope in (
      'all',
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other'
    )),
  identity_confidence text not null default 'unresolved'
    check (identity_confidence in ('high', 'medium', 'low', 'unresolved')),
  identity_review_status text not null default 'not_required'
    check (identity_review_status in (
      'pending',
      'auto_accepted',
      'staff_confirmed',
      'rejected',
      'not_required'
    )),
  identity_reviewed_by uuid references auth.users (id) on delete set null,
  identity_reviewed_at timestamptz,
  identity_resolution text,
  resolved_website text,
  research_brief text,
  provider text,
  provider_metadata jsonb not null default '{}'::jsonb,
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  supersedes_run_id uuid references account_research_runs (id) on delete set null
);

create unique index if not exists account_research_runs_one_active_per_retailer_uidx
  on account_research_runs (retailer_id)
  where status in ('pending', 'running');

create index if not exists account_research_runs_retailer_completed_idx
  on account_research_runs (retailer_id, completed_at desc)
  where status in ('succeeded', 'partial');

create index if not exists account_research_runs_retailer_id_idx
  on account_research_runs (retailer_id);

alter table account_research_runs enable row level security;

drop policy if exists "approved staff full access" on account_research_runs;
create policy "approved staff full access" on account_research_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_source_searches (platform-specific search within a run)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_source_searches (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  source_type text not null
    check (source_type in (
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other'
    )),
  search_mode text not null
    check (search_mode in ('identity', 'recent_activity', 'storefront')),
  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'succeeded',
      'none_indexed',
      'blocked',
      'failed',
      'cancelled'
    )),
  resolved_public_url text,
  query_text text,
  provider text,
  result_count integer not null default 0
    check (result_count >= 0),
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  provider_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (research_run_id, source_type, search_mode)
);

create index if not exists account_research_source_searches_run_source_status_idx
  on account_research_source_searches (research_run_id, source_type, status);

alter table account_research_source_searches enable row level security;

drop policy if exists "approved staff full access" on account_research_source_searches;
create policy "approved staff full access" on account_research_source_searches
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_citations
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_citations (
  id uuid primary key default gen_random_uuid(),
  source_search_id uuid not null references account_research_source_searches (id) on delete cascade,
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  retailer_id integer not null references prospects (id) on delete cascade,
  source_url text not null,
  source_url_normalized text not null,
  title text,
  platform text not null
    check (platform in (
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other',
      'directory'
    )),
  published_at timestamptz,
  observed_at timestamptz not null,
  excerpt text,
  confidence text not null
    check (confidence in ('high', 'medium', 'low')),
  identity_confidence text not null
    check (identity_confidence in ('high', 'medium', 'low', 'unresolved')),
  acceptance_status text not null default 'pending'
    check (acceptance_status in ('pending', 'accepted', 'rejected')),
  acceptance_basis text
    check (acceptance_basis is null or acceptance_basis in ('identity_gate', 'staff')),
  accepted_or_rejected_by uuid references auth.users (id) on delete set null,
  accepted_or_rejected_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_search_id, source_url_normalized)
);

create index if not exists account_research_citations_search_observed_idx
  on account_research_citations (source_search_id, observed_at desc);

create index if not exists account_research_citations_run_acceptance_idx
  on account_research_citations (research_run_id, acceptance_status);

alter table account_research_citations enable row level security;

drop policy if exists "approved staff full access" on account_research_citations;
create policy "approved staff full access" on account_research_citations
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- Sync denormalized research_run_id / retailer_id from parent source search + run
create or replace function public.account_research_citations_sync_parent()
returns trigger
language plpgsql
as $$
declare
  v_run_id uuid;
  v_retailer_id integer;
begin
  select s.research_run_id, r.retailer_id
  into v_run_id, v_retailer_id
  from account_research_source_searches s
  join account_research_runs r on r.id = s.research_run_id
  where s.id = new.source_search_id;

  if v_run_id is null then
    raise exception 'account_research_citations: source_search_id % not found', new.source_search_id;
  end if;

  new.research_run_id := v_run_id;
  new.retailer_id := v_retailer_id;
  return new;
end;
$$;

drop trigger if exists account_research_citations_sync_parent on account_research_citations;
create trigger account_research_citations_sync_parent
  before insert or update of source_search_id on account_research_citations
  for each row execute function public.account_research_citations_sync_parent();

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_profile_suggestions
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  retailer_id integer not null references prospects (id) on delete cascade,
  field_path text not null,
  suggested_value jsonb not null,
  rationale text,
  confidence text not null
    check (confidence in ('high', 'medium', 'low')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_research_profile_suggestions_run_pending_idx
  on account_research_profile_suggestions (research_run_id)
  where status = 'pending';

create index if not exists account_research_profile_suggestions_retailer_status_idx
  on account_research_profile_suggestions (retailer_id, status);

alter table account_research_profile_suggestions enable row level security;

drop policy if exists "approved staff full access" on account_research_profile_suggestions;
create policy "approved staff full access" on account_research_profile_suggestions
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.account_research_profile_suggestions_sync_retailer()
returns trigger
language plpgsql
as $$
declare
  v_retailer_id integer;
begin
  select retailer_id into v_retailer_id
  from account_research_runs
  where id = new.research_run_id;

  if v_retailer_id is null then
    raise exception 'account_research_profile_suggestions: research_run_id % not found', new.research_run_id;
  end if;

  new.retailer_id := v_retailer_id;
  return new;
end;
$$;

drop trigger if exists account_research_profile_suggestions_sync_retailer
  on account_research_profile_suggestions;
create trigger account_research_profile_suggestions_sync_retailer
  before insert or update of research_run_id on account_research_profile_suggestions
  for each row execute function public.account_research_profile_suggestions_sync_retailer();

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_suggestion_citations (junction)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_suggestion_citations (
  suggestion_id uuid not null
    references account_research_profile_suggestions (id) on delete cascade,
  citation_id uuid not null
    references account_research_citations (id) on delete cascade,
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, citation_id)
);

create index if not exists account_research_suggestion_citations_citation_idx
  on account_research_suggestion_citations (citation_id);

alter table account_research_suggestion_citations enable row level security;

drop policy if exists "approved staff full access" on account_research_suggestion_citations;
create policy "approved staff full access" on account_research_suggestion_citations
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.account_research_suggestion_citations_same_run()
returns trigger
language plpgsql
as $$
declare
  v_suggestion_run uuid;
  v_citation_run uuid;
begin
  select research_run_id into v_suggestion_run
  from account_research_profile_suggestions
  where id = new.suggestion_id;

  select research_run_id into v_citation_run
  from account_research_citations
  where id = new.citation_id;

  if v_suggestion_run is null then
    raise exception 'account_research_suggestion_citations: suggestion_id % not found', new.suggestion_id;
  end if;
  if v_citation_run is null then
    raise exception 'account_research_suggestion_citations: citation_id % not found', new.citation_id;
  end if;
  if v_suggestion_run <> v_citation_run then
    raise exception
      'account_research_suggestion_citations: suggestion and citation must share research_run_id';
  end if;

  new.research_run_id := v_suggestion_run;
  return new;
end;
$$;

drop trigger if exists account_research_suggestion_citations_same_run
  on account_research_suggestion_citations;
create trigger account_research_suggestion_citations_same_run
  before insert or update of suggestion_id, citation_id on account_research_suggestion_citations
  for each row execute function public.account_research_suggestion_citations_same_run();

-- ─────────────────────────────────────────────────────────────────────────
-- account_product_match_runs (line-specific; explicit sales_line_id)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_product_match_runs (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  sales_line_id uuid not null references lines (id),
  research_run_id uuid not null references account_research_runs (id) on delete restrict,
  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'succeeded',
      'empty',
      'failed',
      'stale_research',
      'cancelled'
    )),
  empty_reason text
    check (
      empty_reason is null
      or empty_reason in (
        'all_recently_emailed',
        'no_eligible_products',
        'no_accepted_evidence',
        'identity_unresolved'
      )
    ),
  requested_by uuid references auth.users (id) on delete set null,
  provider_metadata jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_product_match_runs_retailer_line_created_idx
  on account_product_match_runs (retailer_id, sales_line_id, created_at desc);

alter table account_product_match_runs enable row level security;

drop policy if exists "approved staff full access" on account_product_match_runs;
create policy "approved staff full access" on account_product_match_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_product_match_items (ranks 1–3 only)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_product_match_items (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid not null references account_product_match_runs (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id),
  rank smallint not null
    check (rank between 1 and 3),
  rationale text not null,
  product_fit text not null
    check (product_fit in ('channel_intersect', 'global_fallback')),
  created_at timestamptz not null default now()
);

create unique index if not exists account_product_match_items_run_rank_uidx
  on account_product_match_items (match_run_id, rank);

create unique index if not exists account_product_match_items_run_catalog_uidx
  on account_product_match_items (match_run_id, catalog_item_id);

alter table account_product_match_items enable row level security;

drop policy if exists "approved staff full access" on account_product_match_items;
create policy "approved staff full access" on account_product_match_items
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_product_match_item_citations (junction)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_product_match_item_citations (
  match_item_id uuid not null
    references account_product_match_items (id) on delete cascade,
  citation_id uuid not null
    references account_research_citations (id) on delete cascade,
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_item_id, citation_id)
);

create index if not exists account_product_match_item_citations_citation_idx
  on account_product_match_item_citations (citation_id);

alter table account_product_match_item_citations enable row level security;

drop policy if exists "approved staff full access" on account_product_match_item_citations;
create policy "approved staff full access" on account_product_match_item_citations
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.account_product_match_item_citations_same_run()
returns trigger
language plpgsql
as $$
declare
  v_match_run uuid;
  v_citation_run uuid;
begin
  select mr.research_run_id into v_match_run
  from account_product_match_items mi
  join account_product_match_runs mr on mr.id = mi.match_run_id
  where mi.id = new.match_item_id;

  select research_run_id into v_citation_run
  from account_research_citations
  where id = new.citation_id;

  if v_match_run is null then
    raise exception 'account_product_match_item_citations: match_item_id % not found', new.match_item_id;
  end if;
  if v_citation_run is null then
    raise exception 'account_product_match_item_citations: citation_id % not found', new.citation_id;
  end if;
  if v_match_run <> v_citation_run then
    raise exception
      'account_product_match_item_citations: citation must belong to match run research_run_id';
  end if;

  new.research_run_id := v_match_run;
  return new;
end;
$$;

drop trigger if exists account_product_match_item_citations_same_run
  on account_product_match_item_citations;
create trigger account_product_match_item_citations_same_run
  before insert or update of match_item_id, citation_id on account_product_match_item_citations
  for each row execute function public.account_product_match_item_citations_same_run();

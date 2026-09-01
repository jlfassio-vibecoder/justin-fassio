-- Active account invoice line items (Vintage Goods PDF import).

create table if not exists account_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id integer not null references prospects (id) on delete cascade,
  line_id uuid not null references lines (id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null,
  source_filename text not null,
  bill_to_name text,
  imported_at timestamptz not null default now(),
  unique (account_id, line_id, invoice_number)
);

create index if not exists account_invoices_account_date_idx
  on account_invoices (account_id, invoice_date desc);

create table if not exists account_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references account_invoices (id) on delete cascade,
  sku_base text not null,
  style_name text not null default '',
  quantity integer not null check (quantity > 0),
  catalog_item_id uuid references catalog_items (id) on delete set null,
  unique (invoice_id, sku_base)
);

create index if not exists account_invoice_lines_invoice_id_idx
  on account_invoice_lines (invoice_id);

create index if not exists account_invoice_lines_sku_base_idx
  on account_invoice_lines (sku_base);

alter table account_invoices enable row level security;
alter table account_invoice_lines enable row level security;

drop policy if exists "approved staff full access" on account_invoices;
create policy "approved staff full access" on account_invoices
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on account_invoice_lines;
create policy "approved staff full access" on account_invoice_lines
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

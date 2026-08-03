-- Shared account contacts (buyer / manager / owner) for prospects and active accounts.
-- Idempotent: safe to re-run.

create table if not exists account_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id integer not null references prospects (id) on delete cascade,
  role text not null,
  full_name text not null,
  title text,
  phone text,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table account_contacts
  drop constraint if exists account_contacts_role_check;

alter table account_contacts
  add constraint account_contacts_role_check
  check (role in ('buyer', 'manager', 'owner'));

create index if not exists account_contacts_account_id_idx on account_contacts (account_id);
create index if not exists account_contacts_full_name_lower_idx on account_contacts (lower(full_name));
create unique index if not exists account_contacts_one_primary_per_account_idx
  on account_contacts (account_id)
  where is_primary;

drop trigger if exists account_contacts_set_updated_at on account_contacts;
create trigger account_contacts_set_updated_at
  before update on account_contacts
  for each row execute function set_updated_at();

alter table account_contacts enable row level security;

drop policy if exists "approved staff full access" on account_contacts;
create policy "approved staff full access" on account_contacts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

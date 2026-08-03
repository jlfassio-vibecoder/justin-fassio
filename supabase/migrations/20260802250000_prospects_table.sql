-- Prospects directory (BC retailers). Integer ids stay stable so calls.prospect_id
-- and prospect_updates.prospect_id continue to match without a foreign key.

create table if not exists prospects (
  id integer primary key,
  name text not null,
  category text not null,
  region text not null,
  city text not null,
  address text not null default '',
  phone text not null default '',
  fit text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_category_idx on prospects (category);
create index if not exists prospects_region_idx on prospects (region);

drop trigger if exists prospects_set_updated_at on prospects;
create trigger prospects_set_updated_at
  before update on prospects
  for each row execute function set_updated_at();

alter table prospects enable row level security;

drop policy if exists "approved staff full access" on prospects;
create policy "approved staff full access" on prospects
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

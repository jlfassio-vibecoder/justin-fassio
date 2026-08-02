-- Profiles approval workflow: owner/rep/buyer + pending/approved/rejected,
-- signup defaults to pending rep, domain RLS gated to approved staff.
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- profiles: role + status
-- ─────────────────────────────────────────────────────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check
  check (role in ('owner', 'rep', 'buyer'));

alter table profiles
  add column if not exists status text;

update profiles
set status = 'pending'
where status is null;

alter table profiles
  alter column status set default 'pending';

alter table profiles
  alter column status set not null;

alter table profiles drop constraint if exists profiles_status_check;
alter table profiles
  add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists profiles_status_idx on profiles (status);
create index if not exists profiles_role_idx on profiles (role);

-- New signups: pending rep (buyer self-serve stays off until Buyer Portal ships).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'rep',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Users may update own profile but cannot change role or status.
drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
    and status = (select p.status from profiles p where p.id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Domain RLS: approved owner/rep only
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role in ('owner', 'rep')
  );
$$;

revoke all on function public.is_approved_staff() from public;
grant execute on function public.is_approved_staff() to authenticated;

drop policy if exists "authenticated full access" on lines;
drop policy if exists "approved staff full access" on lines;
create policy "approved staff full access" on lines
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "authenticated full access" on catalog_items;
drop policy if exists "approved staff full access" on catalog_items;
create policy "approved staff full access" on catalog_items
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "authenticated full access" on prospect_updates;
drop policy if exists "approved staff full access" on prospect_updates;
create policy "approved staff full access" on prospect_updates
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "authenticated full access" on calls;
drop policy if exists "approved staff full access" on calls;
create policy "approved staff full access" on calls
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

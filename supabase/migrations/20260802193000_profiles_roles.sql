-- Profiles + roles for Justin (rep) and invited buyers.
-- Safe to re-run.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'buyer' check (role in ('rep', 'buyer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile" on profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Prevent privilege escalation: users cannot change their own role.
    and role = (select p.role from profiles p where p.id = auth.uid())
  );

-- Auto-create a buyer profile on signup; promote Justin to rep in the dashboard.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'buyer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

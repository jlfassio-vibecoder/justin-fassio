-- Tighten RLS now that /app uses Supabase Auth:
-- 1) domain tables: authenticated only (drop world-writable anon policies)
-- 2) profiles: prevent buyers from self-promoting to rep

drop policy if exists "public full access" on lines;
drop policy if exists "authenticated full access" on lines;
create policy "authenticated full access" on lines
  for all to authenticated using (true) with check (true);

drop policy if exists "public full access" on catalog_items;
drop policy if exists "authenticated full access" on catalog_items;
create policy "authenticated full access" on catalog_items
  for all to authenticated using (true) with check (true);

drop policy if exists "public full access" on prospect_updates;
drop policy if exists "authenticated full access" on prospect_updates;
create policy "authenticated full access" on prospect_updates
  for all to authenticated using (true) with check (true);

drop policy if exists "public full access" on calls;
drop policy if exists "authenticated full access" on calls;
create policy "authenticated full access" on calls
  for all to authenticated using (true) with check (true);

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
  );

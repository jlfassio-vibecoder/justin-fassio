-- Restrict staff-avatars object policies to approved staff (buyers cannot use the bucket).

drop policy if exists "staff read own avatar" on storage.objects;
create policy "staff read own avatar"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.is_approved_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "staff insert own avatar" on storage.objects;
create policy "staff insert own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and public.is_approved_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "staff update own avatar" on storage.objects;
create policy "staff update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.is_approved_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'staff-avatars'
    and public.is_approved_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "staff delete own avatar" on storage.objects;
create policy "staff delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.is_approved_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

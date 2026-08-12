-- Staff Account: avatar path on profiles + private own-object storage bucket.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars',
  'staff-avatars',
  false,
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at {auth.uid()}/avatar.{ext}

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

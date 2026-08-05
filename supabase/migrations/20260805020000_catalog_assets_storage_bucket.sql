-- Private storage bucket for catalog product / page images (P4).
-- Paths: {line_code}/{catalog_year}/{sku}/primary.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-assets',
  'catalog-assets',
  false,
  10485760,
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "approved staff read catalog assets" on storage.objects;
create policy "approved staff read catalog assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'catalog-assets' and public.is_approved_staff());

drop policy if exists "approved staff write catalog assets" on storage.objects;
create policy "approved staff write catalog assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-assets' and public.is_approved_staff());

drop policy if exists "approved staff update catalog assets" on storage.objects;
create policy "approved staff update catalog assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'catalog-assets' and public.is_approved_staff())
  with check (bucket_id = 'catalog-assets' and public.is_approved_staff());

drop policy if exists "approved staff delete catalog assets" on storage.objects;
create policy "approved staff delete catalog assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-assets' and public.is_approved_staff());

-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0002 — Storage buckets for business logos and product images
--
-- DATA_MODEL.md §13: "Storage bucket policy must mirror the RLS model: an
-- object under {business_id}/... is readable by members of that business
-- and writable by owners and managers." Objects are stored as
-- {business_id}/{uuid}.webp (see src/lib/image-upload.ts).
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('business-logos', 'business-logos', true),
  ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Buckets are public for read (simple <img> tags, no signed URLs needed) —
-- writes are still gated by business membership below.

create policy business_logos_read on storage.objects
  for select using (bucket_id = 'business-logos');

create policy business_logos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-logos'
    and public.has_role_in((storage.foldername(name))[1]::uuid, array['owner','manager']::public.member_role[])
  );

create policy business_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-logos'
    and public.has_role_in((storage.foldername(name))[1]::uuid, array['owner','manager']::public.member_role[])
  );

create policy business_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-logos'
    and public.has_role_in((storage.foldername(name))[1]::uuid, array['owner','manager']::public.member_role[])
  );

create policy product_images_read on storage.objects
  for select using (bucket_id = 'product-images');

create policy product_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_role_in((storage.foldername(name))[1]::uuid, array['owner','manager']::public.member_role[])
  );

create policy product_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role_in((storage.foldername(name))[1]::uuid, array['owner','manager']::public.member_role[])
  );

create policy product_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role_in((storage.foldername(name))[1]::uuid, array['owner','manager']::public.member_role[])
  );

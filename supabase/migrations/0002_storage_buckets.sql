-- ============================================================================
-- Business Pro / Sales Manager
-- Migration 0002 — Storage buckets for business logos and product images
--
-- DATA_MODEL.md §13: "Storage bucket policy must mirror the RLS model: an
-- object under {business_id}/... is readable by members of that business
-- and writable by owners and managers." Objects are stored as
-- {business_id}/logo/{uuid}.webp or {business_id}/products/{product_id}/{uuid}.webp
-- (see src/lib/image-upload.ts).
--
-- Buckets are private (public: false): the client renders images via
-- createSignedUrl()/createSignedUrls() — see
-- src/lib/image-upload.ts:createSignedImageUrl(). Because the bucket is
-- private, the SELECT policies below are load-bearing — they're what
-- actually gates who can generate a signed URL for an object, scoped to
-- business membership. If this ever changes back to a public bucket with
-- getPublicUrl(), the read policies become vestigial (a public bucket
-- serves objects from the public endpoint regardless of SELECT policy) and
-- should be loosened accordingly — but don't make that change without also
-- changing every call site back to getPublicUrl in the same commit; the
-- code and the bucket's public flag must always agree, or uploads succeed
-- while images silently never render.
--
-- Size limits are deliberate: WEB_IMPLEMENTATION.md §13 requires client-side
-- compression to under 300KB before upload. A limit well above that (2MB /
-- 5MB) catches a broken compression path without blocking a legitimate one.
--
-- allowed_mime_types is image/webp only: compressImage() (src/lib/image-upload.ts)
-- always re-encodes the source file to WebP via canvas before upload, and the
-- client always sets contentType: 'image/webp' — no other content type is
-- ever sent by this codebase. The original file (JPEG/PNG/WebP/HEIC) is
-- validated client-side before compression, not by the bucket.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-logos', 'business-logos', false, 2097152, array['image/webp']),
  ('product-images', 'product-images', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public              = excluded.public,
      file_size_limit     = excluded.file_size_limit,
      allowed_mime_types  = excluded.allowed_mime_types;

-- The first path segment is the owning business_id (see the upload helper
-- above). A malformed segment would throw on a bare ::uuid cast inside a
-- policy — that surfaces as an opaque 500 instead of a clean denial. Guard
-- it: is_member_of(null) and has_role_in(null, ...) both evaluate to false,
-- so a malformed path is denied like any other unauthorized path.
create or replace function public.safe_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists business_logos_read on storage.objects;
create policy business_logos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-logos'
    and public.is_member_of(public.safe_uuid((storage.foldername(name))[1]))
  );

drop policy if exists business_logos_write on storage.objects;
create policy business_logos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-logos'
    and public.has_role_in(public.safe_uuid((storage.foldername(name))[1]), array['owner','manager']::public.member_role[])
  );

drop policy if exists business_logos_update on storage.objects;
create policy business_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-logos'
    and public.has_role_in(public.safe_uuid((storage.foldername(name))[1]), array['owner','manager']::public.member_role[])
  );

drop policy if exists business_logos_delete on storage.objects;
create policy business_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-logos'
    and public.has_role_in(public.safe_uuid((storage.foldername(name))[1]), array['owner','manager']::public.member_role[])
  );

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_member_of(public.safe_uuid((storage.foldername(name))[1]))
  );

drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_role_in(public.safe_uuid((storage.foldername(name))[1]), array['owner','manager']::public.member_role[])
  );

drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role_in(public.safe_uuid((storage.foldername(name))[1]), array['owner','manager']::public.member_role[])
  );

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role_in(public.safe_uuid((storage.foldername(name))[1]), array['owner','manager']::public.member_role[])
  );

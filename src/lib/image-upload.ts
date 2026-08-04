import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { NETWORK_IMAGE_BUCKET } from '@/lib/storage-buckets'

const MAX_EDGE = 1200
const TARGET_BYTES = 300 * 1024
const ACCEPTED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

/**
 * Compresses and resizes an image before upload — max edge 1200px, WebP,
 * target under 300KB (DATA_MODEL.md §13). Product creation on a slow or
 * metered connection must not feel broken.
 */
export async function compressImage(file: File): Promise<Blob> {
  // Every upload is re-encoded to WebP via canvas, so a non-image file (a
  // PDF, say) would otherwise fail deep inside createImageBitmap with an
  // opaque browser decode error. Reject it up front with a readable message.
  if (!ACCEPTED_INPUT_TYPES.includes(file.type)) {
    throw new Error("That file type isn't supported. Use a JPEG, PNG, WebP, or HEIC image.")
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)

  let quality = 0.9
  let blob = await canvasToBlob(canvas, quality)
  while (blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, quality)
  }
  return blob
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
      'image/webp',
      quality,
    )
  })
}

/**
 * Supabase Storage returns errors in the result object; it does not throw.
 * Carrying bucket/path/status/supabaseMessage lets a caller show the real
 * cause in development while still showing a friendly message in production.
 */
export class StorageUploadError extends Error {
  detail: { bucket: string; path: string; status?: number; supabaseMessage: string }

  constructor(
    message: string,
    detail: { bucket: string; path: string; status?: number; supabaseMessage: string },
  ) {
    super(message)
    this.detail = detail
    this.name = 'StorageUploadError'
  }
}

/** Low-level upload. Every image upload in the app routes through this — nothing calls supabase.storage directly elsewhere. */
async function uploadImage({ bucket, path, file }: { bucket: string; path: string; file: Blob }): Promise<string> {
  if (import.meta.env.DEV) {
    console.debug('[storage] uploading', { bucket, path, type: file.type, size: file.size })
  }

  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: 'image/webp',
  })

  if (error) {
    const detail = {
      bucket,
      path,
      status: (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status,
      supabaseMessage: error.message,
    }
    console.error('[storage] upload failed', detail, error)
    throw new StorageUploadError('Upload failed', detail)
  }

  return data.path
}

export type ImageUploadTarget =
  | { kind: 'logo' }
  // productId is unknown while a product is still being created (it doesn't
  // exist yet); it's known on edit. Both are valid — the policy only
  // requires the business ID to be the first path segment.
  | { kind: 'product-image'; productId?: string }
  // A network listing photo. listingId is unknown while the listing is being
  // created, same as above.
  | { kind: 'network-listing'; listingId?: string }

/**
 * Every storage object path begins with `{business_id}/...` — the storage
 * policies read the first path segment as the business ID and deny anything
 * without it (DATA_MODEL.md §13).
 */
function buildImagePath(businessId: string, target: ImageUploadTarget): string {
  const uuid = crypto.randomUUID()
  if (target.kind === 'logo') {
    return `${businessId}/logo/${uuid}.webp`
  }
  if (target.kind === 'network-listing') {
    return target.listingId
      ? `${businessId}/listings/${target.listingId}/${uuid}.webp`
      : `${businessId}/listings/${uuid}.webp`
  }
  return target.productId
    ? `${businessId}/products/${target.productId}/${uuid}.webp`
    : `${businessId}/products/${uuid}.webp`
}

export async function uploadBusinessScopedImage(
  bucket: string,
  businessId: string,
  file: File,
  target: ImageUploadTarget,
): Promise<string> {
  const compressed = await compressImage(file)
  const path = buildImagePath(businessId, target)
  return uploadImage({ bucket, path, file: compressed })
}

// Buckets are private (public: false) — the storage RLS policies gate reads
// by business membership, so a URL must be signed rather than public. A
// signed URL expires; SIGNED_URL_TTL_SECONDS controls how long, and the
// hooks in hooks/use-signed-image-url.ts set their cache staleTime below
// this so a stale, expired URL is never served from cache.
export const SIGNED_URL_TTL_SECONDS = 3600

export async function createSignedImageUrl(
  bucket: string,
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string | undefined> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) {
    console.error('[storage] failed to sign url', { bucket, path }, error)
    return undefined
  }
  return data.signedUrl
}

/** One request for every path on a page instead of signing sequentially. */
export async function createSignedImageUrls(
  bucket: string,
  paths: string[],
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn)
  if (error) {
    console.error('[storage] failed to sign urls', { bucket, count: paths.length }, error)
    return new Map()
  }

  const map = new Map<string, string>()
  for (const item of data) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

/**
 * The read path for the PUBLIC network-images bucket.
 *
 * Deliberately not createSignedImageUrl: the viewer of a marketplace photo is
 * by definition not a member of the business that uploaded it, so signing —
 * which is gated by is_member_of() on the first path segment — returns
 * nothing. Calling the wrong one here fails silently as a missing image, so
 * the bucket constant and this function are meant to be used together.
 */
export function networkImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  const { data } = supabase.storage.from(NETWORK_IMAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Friendly message in production; the real Supabase error in development, so a real failure is diagnosable without reproducing it against a live project. */
export function toUploadErrorMessage(error: unknown): string {
  if (error instanceof StorageUploadError && import.meta.env.DEV) {
    return `Upload failed: ${error.detail.supabaseMessage}`
  }
  return toReadableError(error)
}

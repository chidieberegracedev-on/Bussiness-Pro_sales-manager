import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'

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

export function getPublicImageUrl(bucket: string, path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** Friendly message in production; the real Supabase error in development, so a real failure is diagnosable without reproducing it against a live project. */
export function toUploadErrorMessage(error: unknown): string {
  if (error instanceof StorageUploadError && import.meta.env.DEV) {
    return `Upload failed: ${error.detail.supabaseMessage}`
  }
  return toReadableError(error)
}

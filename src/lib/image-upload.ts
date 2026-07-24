import { supabase } from '@/lib/supabase'

const MAX_EDGE = 1200
const TARGET_BYTES = 300 * 1024

/**
 * Compresses and resizes an image before upload — max edge 1200px, WebP,
 * target under 300KB (DATA_MODEL.md §13). Product creation on a slow or
 * metered connection must not feel broken.
 */
export async function compressImage(file: File): Promise<Blob> {
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

/** Uploads under `{businessId}/...` so storage policy can mirror the RLS model. */
export async function uploadBusinessScopedImage(
  bucket: string,
  businessId: string,
  file: File,
): Promise<string> {
  const compressed = await compressImage(file)
  const path = `${businessId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) throw error
  return path
}

export function getPublicImageUrl(bucket: string, path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

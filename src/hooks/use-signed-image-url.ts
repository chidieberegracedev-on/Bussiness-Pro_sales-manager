import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createSignedImageUrl, createSignedImageUrls, SIGNED_URL_TTL_SECONDS } from '@/lib/image-upload'

// Refresh well before the signed URL actually expires, so a component never
// renders a link that 403s.
const STALE_TIME_MS = (SIGNED_URL_TTL_SECONDS - 300) * 1000

export function useSignedImageUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', bucket, path],
    queryFn: () => createSignedImageUrl(bucket, path!),
    enabled: !!path,
    staleTime: STALE_TIME_MS,
  })
}

/** Batched signing for a list/grid — one request instead of one per row. */
export function useSignedImageUrls(bucket: string, paths: (string | null | undefined)[]) {
  const validPaths = useMemo(
    () => Array.from(new Set(paths.filter((p): p is string => !!p))).sort(),
    [paths],
  )

  return useQuery({
    queryKey: ['signed-urls', bucket, validPaths],
    queryFn: () => createSignedImageUrls(bucket, validPaths),
    enabled: validPaths.length > 0,
    staleTime: STALE_TIME_MS,
  })
}

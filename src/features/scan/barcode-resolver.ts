import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { ResolvedBarcode } from '@/types/database'

/**
 * BarcodeResolverService — the ONE place a code becomes a variant.
 *
 * Every scan path in the app calls this: POS, receiving, counting, product
 * lookup, and whatever Android does later. No screen parses a barcode, and no
 * screen queries product_variants.barcode itself. If a second lookup ever
 * appears somewhere, the two will drift and one of them will be wrong.
 *
 * Resolution order lives in the RPC (variant.barcode → product_barcodes alias)
 * and is deliberately not reimplemented, reordered, or cached-around here.
 *
 * The critical output is `units_per_scan`: a carton code resolves to the
 * variant AND the number of BASE units one scan represents. That is how the
 * barcode layer meets the Phase 5 conversion invariant — scanning a carton at
 * receiving adds 12 packs, not 1, and the per-base cost rule still holds
 * because the barcode layer never writes cost or stock itself.
 */
export function useBarcodeResolver() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useCallback(
    async (code: string): Promise<ResolvedBarcode> => {
      const trimmed = code.trim()
      if (!business || !trimmed) return { found: false, code: trimmed }

      // Cached per business+code: a cashier scanning the same item ten times in
      // a row shouldn't be ten round trips. Barcodes are effectively immutable
      // once assigned, so a short stale window is safe.
      return qc.fetchQuery({
        queryKey: ['barcode', business.id, trimmed],
        staleTime: 5 * 60_000,
        queryFn: async () => {
          const { data, error } = await supabase.rpc('resolve_barcode', {
            p_business_id: business.id,
            p_code: trimmed,
          })
          if (error) {
            console.error('[resolve_barcode] failed', { code: trimmed, error })
            throw error
          }
          return data as unknown as ResolvedBarcode
        },
      })
    },
    [business, qc],
  )
}

/** Base units one scan represents. Always ≥ 1; a bad value never multiplies stock. */
export function unitsPerScan(resolved: ResolvedBarcode): number {
  if (!resolved.found) return 1
  const n = Number(resolved.units_per_scan)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function resolvedLabel(resolved: ResolvedBarcode): string {
  if (!resolved.found) return resolved.code
  return resolved.variant_name
    ? `${resolved.product_name} · ${resolved.variant_name}`
    : resolved.product_name
}

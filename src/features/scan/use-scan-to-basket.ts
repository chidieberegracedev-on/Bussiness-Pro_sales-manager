import { useCallback, useState } from 'react'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useCartStore } from '@/features/pos/cart-store'
import { useBarcodeResolver, unitsPerScan, resolvedLabel } from '@/features/scan/barcode-resolver'
import { useExclusiveScanSubscription } from '@/features/scan/scan-engine'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import type { ResolvedBarcode } from '@/types/database'

export interface ScanFeedback {
  ok: boolean
  label: string
  detail?: string
}

/**
 * Scan-to-basket — the fast path, and the first client of the Scan Engine.
 *
 * A carton barcode adds `units_per_scan` base units rather than one, so the
 * conversion rule holds at the till exactly as it does at receiving: the
 * barcode carries the unit context, and nothing here multiplies stock itself.
 */
export function useScanToBasket(enabled = true) {
  const resolve = useBarcodeResolver()
  const { business } = useActiveBusiness()
  const addLine = useCartStore((s) => s.addLine)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)

  const handle = useCallback(
    async (code: string) => {
      const resolved: ResolvedBarcode = await resolve(code)

      if (!resolved.found) {
        setFeedback({ ok: false, label: code, detail: 'Not linked to any product' })
        toast({
          variant: 'destructive',
          title: 'Unknown barcode',
          description: `${code} isn't linked to a product yet. Add it from the product's page.`,
        })
        return
      }

      // The variant's base unit isn't in the resolver payload — it lives on the
      // product — so fetch it once. Cached by react-query on the resolver side;
      // this is the only extra hop and it only happens on a real hit.
      let baseUnit = 'unit'
      if (business) {
        const { data } = await supabase
          .from('product_variants')
          .select('products(base_unit)')
          .eq('id', resolved.variant_id)
          .single()
        const row = data as unknown as { products: { base_unit: string } | null } | null
        baseUnit = row?.products?.base_unit ?? 'unit'
      }

      const units = new Decimal(unitsPerScan(resolved))
      addLine({
        variantId: resolved.variant_id,
        productName: resolved.product_name,
        variantName: resolved.variant_name,
        baseUnit,
        unitPrice: new Decimal(resolved.selling_price),
        quantity: units,
      })

      const label = resolvedLabel(resolved)
      setFeedback({
        ok: true,
        label,
        detail: units.gt(1) ? `${units.toString()} ${baseUnit} (carton)` : undefined,
      })
      if (units.gt(1)) {
        toast({
          title: `${label} × ${units.toString()}`,
          description: `Carton barcode — added ${units.toString()} ${baseUnit}.`,
        })
      }
    },
    [resolve, addLine, business],
  )

  useExclusiveScanSubscription((event) => void handle(event.code), enabled)

  return { feedback, clearFeedback: () => setFeedback(null), handleCode: handle }
}

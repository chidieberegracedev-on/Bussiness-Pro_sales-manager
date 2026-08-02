import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { BarcodeKind, Database } from '@/types/database'

export type ProductBarcode = Database['public']['Tables']['product_barcodes']['Row']

export const BARCODE_KIND_LABELS: Record<BarcodeKind, string> = {
  manufacturer: 'Manufacturer (EAN/UPC)',
  internal: 'Internal code',
  carton: 'Carton / case',
  warehouse: 'Warehouse',
  promotional: 'Promotional',
  other: 'Other',
}

export const BARCODE_KIND_HINTS: Record<BarcodeKind, string> = {
  manufacturer: "The code printed on the packaging by whoever made it.",
  internal: 'A code you generate and print yourself, for items with no barcode.',
  carton: 'A code on the outer box. Set how many base units it contains.',
  warehouse: 'A bin, shelf, or zone code used in the back room.',
  promotional: 'A temporary code for a bundle or offer.',
  other: 'Anything else that should resolve to this item.',
}

export function useVariantBarcodes(variantId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['barcodes', business?.id, variantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_barcodes')
        .select('*')
        .eq('variant_id', variantId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProductBarcode[]
    },
    enabled: !!business && !!variantId,
  })
}

export function useAddBarcode() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      variantId: string
      code: string
      kind: BarcodeKind
      unitsPerScan: string
    }) => {
      const { data, error } = await supabase
        .from('product_barcodes')
        .insert({
          business_id: business!.id,
          variant_id: input.variantId,
          code: input.code.trim(),
          kind: input.kind,
          units_per_scan: input.unitsPerScan || '1',
        })
        .select()
        .single()
      if (error) {
        console.error('[product_barcodes.insert] failed', { input, error })
        throw error
      }
      return data as ProductBarcode
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['barcodes', business?.id, row.variant_id] })
      // A new code must resolve immediately — the resolver caches by code.
      qc.invalidateQueries({ queryKey: ['barcode', business?.id] })
    },
  })
}

export function useDeleteBarcode() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_barcodes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['barcodes', business?.id] })
      qc.invalidateQueries({ queryKey: ['barcode', business?.id] })
    },
  })
}

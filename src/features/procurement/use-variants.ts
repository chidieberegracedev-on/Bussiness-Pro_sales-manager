import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { StockStatus } from '@/types/database'

export interface VariantOption {
  variant_id: string
  product_id: string
  product_name: string
  variant_name: string | null
  sku: string | null
  base_unit: string
  qty_on_hand: string
  avg_cost: string
  selling_price: string
  low_stock_threshold: string
  stock_status: StockStatus
}

/**
 * Returns all active variants across the business as picker rows.
 * Used by the PO builder and supplier-link picker.
 */
export function useVariantsForPicker(search: string) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['variants-picker', business?.id, search],
    queryFn: async () => {
      let query = supabase
        .from('v_variant_stock')
        .select(
          'variant_id, product_id, product_name, variant_name, sku, base_unit, qty_on_hand, avg_cost, selling_price, low_stock_threshold, stock_status',
        )
        .eq('business_id', business!.id)
        .eq('is_active', true)
        .order('product_name', { ascending: true })
        .limit(200)

      const trimmed = search.trim()
      if (trimmed) {
        const escaped = trimmed.replace(/[%,]/g, '')
        query = query.or(
          `product_name.ilike.%${escaped}%,sku.ilike.%${escaped}%,barcode.ilike.%${escaped}%`,
        )
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as VariantOption[]
    },
    enabled: !!business,
    staleTime: 30_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { VariantStockRow } from '@/features/products/types'

// BR-6.6 / AC-6.6: negative first, then out of stock, then low.
const STATUS_ORDER = ['negative', 'out_of_stock', 'low'] as const

export function useLowStock() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['low-stock', business?.id],
    queryFn: async (): Promise<VariantStockRow[]> => {
      const { data, error } = await supabase
        .from('v_variant_stock')
        .select('*')
        .eq('business_id', business!.id)
        .eq('is_active', true)
        .in('stock_status', STATUS_ORDER)
        .order('product_name', { ascending: true })
      if (error) throw error

      const rows = (data ?? []) as unknown as VariantStockRow[]
      return rows.sort((a, b) => STATUS_ORDER.indexOf(a.stock_status as any) - STATUS_ORDER.indexOf(b.stock_status as any))
    },
    enabled: !!business,
  })
}

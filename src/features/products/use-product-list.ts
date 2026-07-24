import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { groupByProduct, type VariantStockRow } from '@/features/products/types'
import type { StockStatus } from '@/types/database'

export interface ProductListFilters {
  search: string
  categoryId: string | 'all'
  status: StockStatus | 'all'
  active: 'active' | 'inactive' | 'all'
}

// V1 scale: fetch the full matching set and group/paginate client-side
// (WEB_IMPLEMENTATION.md §8.1 — acceptable until a business has "a few
// thousand" variants, at which point this becomes a server-side aggregate).
const FETCH_CAP = 5000

export function useProductList(filters: ProductListFilters) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['product-list', business?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('v_variant_stock')
        .select('*')
        .eq('business_id', business!.id)
        .limit(FETCH_CAP)

      if (filters.active === 'active') query = query.eq('is_active', true)
      if (filters.active === 'inactive') query = query.eq('is_active', false)
      if (filters.categoryId !== 'all') query = query.eq('category_id', filters.categoryId)
      if (filters.status !== 'all') query = query.eq('stock_status', filters.status)

      const search = filters.search.trim()
      if (search) {
        const escaped = search.replace(/[%,]/g, '')
        query = query.or(
          `product_name.ilike.%${escaped}%,sku.ilike.%${escaped}%,barcode.ilike.%${escaped}%`,
        )
      }

      const { data, error } = await query.order('product_name', { ascending: true })
      if (error) throw error
      return groupByProduct((data ?? []) as VariantStockRow[])
    },
    enabled: !!business,
  })
}

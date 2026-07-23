import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductPurchaseUnit(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-purchase-unit', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('purchase_unit, purchase_conversion_qty')
        .eq('id', productId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!productId,
  })
}

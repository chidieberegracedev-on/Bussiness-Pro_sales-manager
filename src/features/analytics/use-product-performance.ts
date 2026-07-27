import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

export interface ProductPerformanceRow {
  product_id: string
  product_name: string
  units_sold: string
  revenue: string
  cost: string | null
  gross_profit: string | null
  last_sold_at: string | null
}

export function useProductPerformance(from: string, to: string) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'product-performance', business?.id, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('product_performance', {
        p_business_id: business!.id,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return (data ?? []) as unknown as ProductPerformanceRow[]
    },
    enabled: !!business && !!from && !!to,
    staleTime: 60_000,
  })
}

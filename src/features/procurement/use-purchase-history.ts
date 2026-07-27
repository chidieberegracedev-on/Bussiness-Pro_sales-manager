import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database } from '@/types/database'

export type PurchaseHistoryRow = Database['public']['Views']['v_purchase_history']['Row']

export interface HistoryFilters {
  supplierId: string | 'all'
  variantId: string | 'all'
  from: string
  to: string
  poId?: string
}

export function usePurchaseHistory(filters: HistoryFilters) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['purchase-history', business?.id, filters],
    queryFn: async () => {
      let q = supabase
        .from('v_purchase_history')
        .select('*')
        .eq('business_id', business!.id)
        .order('received_at', { ascending: false })
        .limit(500)
      if (filters.supplierId !== 'all') q = q.eq('supplier_id', filters.supplierId)
      if (filters.variantId !== 'all') q = q.eq('variant_id', filters.variantId)
      if (filters.poId) q = q.eq('po_id', filters.poId)
      if (filters.from) q = q.gte('received_at', filters.from)
      if (filters.to) q = q.lte('received_at', filters.to)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PurchaseHistoryRow[]
    },
    enabled: !!business,
    staleTime: 30_000,
  })
}

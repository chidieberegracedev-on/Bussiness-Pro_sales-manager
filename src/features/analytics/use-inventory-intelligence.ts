import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database } from '@/types/database'

type InventoryValueRow = Database['public']['Views']['v_inventory_value']['Row']
type InventoryByCategoryRow = Database['public']['Views']['v_inventory_value_by_category']['Row']

export function useInventoryValue() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'inventory-value', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_inventory_value')
        .select('*')
        .eq('business_id', business!.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return (data ?? null) as InventoryValueRow | null
    },
    enabled: !!business,
    staleTime: 60_000,
  })
}

export function useInventoryByCategory() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'inventory-by-category', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_inventory_value_by_category')
        .select('*')
        .eq('business_id', business!.id)
        .order('total_cost_value', { ascending: false })
      if (error) throw error
      return (data ?? []) as InventoryByCategoryRow[]
    },
    enabled: !!business,
    staleTime: 60_000,
  })
}

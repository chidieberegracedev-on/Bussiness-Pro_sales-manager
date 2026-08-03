import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database } from '@/types/database'

export type RestockSuggestion = Database['public']['Functions']['restock_suggestions']['Returns'][number]

export function useRestockSuggestions() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['restock-suggestions', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('restock_suggestions', {
        p_business_id: business!.id,
      })
      if (error) {
        console.error('[restock_suggestions] failed', error)
        throw error
      }
      return (data ?? []) as RestockSuggestion[]
    },
    enabled: !!business,
    staleTime: 30_000,
  })
}

export interface RestockGroup {
  supplierId: string | null
  supplierName: string | null
  rows: RestockSuggestion[]
}

export function groupBySupplier(suggestions: RestockSuggestion[]): RestockGroup[] {
  const groups = new Map<string, RestockGroup>()
  for (const s of suggestions) {
    const key = s.supplier_id ?? '__none__'
    let group = groups.get(key)
    if (!group) {
      group = {
        supplierId: s.supplier_id ?? null,
        supplierName: s.supplier_name ?? null,
        rows: [],
      }
      groups.set(key, group)
    }
    group.rows.push(s)
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.supplierId && b.supplierId) return 1
    if (a.supplierId && !b.supplierId) return -1
    return (a.supplierName ?? '').localeCompare(b.supplierName ?? '')
  })
}

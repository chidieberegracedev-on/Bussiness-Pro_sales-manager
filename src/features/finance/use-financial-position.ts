import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database, FinancialAccount } from '@/types/database'

export type FinancialPosition = Database['public']['Functions']['financial_position']['Returns']
export type CashbookRow = Database['public']['Views']['v_cashbook']['Row']

export function useFinancialPosition() {
  const { business, role } = useActiveBusiness()
  const canSee = role === 'owner' || role === 'manager'

  return useQuery({
    queryKey: ['financial-position', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('financial_position', {
        p_business_id: business!.id,
      })
      if (error) throw error
      return data as unknown as FinancialPosition
    },
    enabled: !!business && canSee,
    staleTime: 30_000,
  })
}

export interface CashbookFilters {
  account?: FinancialAccount | 'all'
  from?: string
  to?: string
  shiftId?: string
}

export function useCashbook(filters: CashbookFilters = {}) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['cashbook', business?.id, filters],
    queryFn: async () => {
      let q = supabase
        .from('v_cashbook')
        .select('*')
        .eq('business_id', business!.id)
        .order('occurred_at', { ascending: false })
        .limit(500)
      if (filters.account && filters.account !== 'all') q = q.eq('account', filters.account)
      if (filters.from) q = q.gte('occurred_at', filters.from)
      if (filters.to) q = q.lte('occurred_at', filters.to)
      if (filters.shiftId) q = q.eq('shift_id', filters.shiftId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as CashbookRow[]
    },
    enabled: !!business,
    staleTime: 30_000,
  })
}

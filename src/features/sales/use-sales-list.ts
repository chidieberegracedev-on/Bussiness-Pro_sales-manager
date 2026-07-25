import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database } from '@/types/database'

export type SaleSummaryRow = Database['public']['Views']['v_sale_summary']['Row']

export interface SalesListFilters {
  /** Inclusive UTC ISO start of the business day being viewed. */
  from: string
  /** Exclusive UTC ISO end of the business day being viewed. */
  to: string
}

export function useSalesList(filters: SalesListFilters, page: number, pageSize = 50) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['sales', 'list', business?.id, filters, page, pageSize],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('v_sale_summary')
        .select('*', { count: 'exact' })
        .eq('business_id', business!.id)
        .gte('completed_at', filters.from)
        .lt('completed_at', filters.to)
        .order('completed_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (error) throw error
      return { rows: (data ?? []) as SaleSummaryRow[], total: count ?? 0 }
    },
    enabled: !!business,
  })
}

/**
 * Aggregate totals for the viewed range — filtered to status='completed'
 * per the voided-sales exclusion rule (SCOPE.md amendment): any summed
 * analytic must exclude voided sales, even though individual voided rows
 * still appear in the list itself for audit visibility.
 */
export function useSalesTotals(filters: SalesListFilters) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['sales', 'totals', business?.id, filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_sale_summary')
        .select('grand_total, gross_profit, unit_count')
        .eq('business_id', business!.id)
        .eq('status', 'completed')
        .gte('completed_at', filters.from)
        .lt('completed_at', filters.to)

      if (error) throw error
      const rows = data ?? []
      return {
        saleCount: rows.length,
        grandTotal: rows.reduce((sum, r) => sum.plus(r.grand_total), new Decimal(0)),
        grossProfit: rows.reduce((sum, r) => sum.plus(r.gross_profit), new Decimal(0)),
        unitsSold: rows.reduce((sum, r) => sum.plus(r.unit_count), new Decimal(0)),
      }
    },
    enabled: !!business,
  })
}

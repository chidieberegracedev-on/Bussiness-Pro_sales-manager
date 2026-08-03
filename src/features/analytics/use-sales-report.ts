import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

export interface SalesReportData {
  total_revenue: string
  total_cost: string
  gross_profit: string
  transaction_count: number
  units_sold: string
  avg_transaction: string
  payment_breakdown: { method: string; amount: string; count: number }[]
  currency_code: string
}

export function useSalesReport(from: string, to: string) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'sales-report', business?.id, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sales_report', {
        p_business_id: business!.id,
        p_from: from,
        p_to: to,
      })
      if (error) {
        console.error('[sales_report] failed', error)
        throw error
      }
      return data as unknown as SalesReportData
    },
    enabled: !!business && !!from && !!to,
    staleTime: 60_000,
  })
}

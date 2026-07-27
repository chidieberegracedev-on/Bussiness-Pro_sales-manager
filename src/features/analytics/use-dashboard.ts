import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

export interface DashboardPeriod {
  revenue: string
  cost?: string
  gross_profit?: string
  transactions: number
  avg_transaction?: string
}

export interface DashboardData {
  today: DashboardPeriod
  yesterday: Pick<DashboardPeriod, 'revenue' | 'transactions'>
  week: Pick<DashboardPeriod, 'revenue' | 'gross_profit' | 'transactions'>
  month: Pick<DashboardPeriod, 'revenue' | 'gross_profit' | 'transactions'>
  currency_code: string
}

export function useDashboardSummary() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'dashboard', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary', {
        p_business_id: business!.id,
      })
      if (error) throw error
      return data as unknown as DashboardData
    },
    enabled: !!business,
    staleTime: 60_000,
  })
}

export interface TimeseriesPoint {
  bucket_start: string
  revenue: string
  cost: string
  transactions: number
}

export function useSalesTimeseries(from: string, to: string, bucket: 'day' | 'hour') {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'timeseries', business?.id, from, to, bucket],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sales_timeseries', {
        p_business_id: business!.id,
        p_from: from,
        p_to: to,
        p_bucket: bucket,
      })
      if (error) throw error
      return (data ?? []) as unknown as TimeseriesPoint[]
    },
    enabled: !!business && !!from && !!to,
    staleTime: 60_000,
  })
}

export function useRecentSales(limit = 8) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'recent-sales', business?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_sale_summary')
        .select('*')
        .eq('business_id', business!.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    enabled: !!business,
    staleTime: 60_000,
  })
}

export function useLowStockItems(limit = 10) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['analytics', 'low-stock', business?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_variant_stock')
        .select('*')
        .eq('business_id', business!.id)
        .in('stock_status', ['low', 'out_of_stock'])
        .order('qty_on_hand', { ascending: true })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    enabled: !!business,
    staleTime: 60_000,
  })
}

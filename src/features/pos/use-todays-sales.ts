import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { businessDayStartUtc } from '@/lib/format'
import type { Database } from '@/types/database'

export type SaleSummaryRow = Database['public']['Views']['v_sale_summary']['Row']

/**
 * Today's sales, for the till's History panel.
 *
 * Scoped to the business DAY rather than the last 24 hours, because a cashier
 * asking "did that go through?" means today's trading, and a shop that opens
 * at 6am in one timezone and closes at 11pm should see one coherent day.
 *
 * Voided sales are included on purpose — a cashier looking for a sale that was
 * cancelled needs to find it and see that it was cancelled, not conclude the
 * system lost it.
 */
export function useTodaysSales(enabled = true) {
  const { business } = useActiveBusiness()
  const timezone = business?.timezone ?? 'UTC'

  return useQuery({
    queryKey: ['pos', 'todays-sales', business?.id],
    queryFn: async () => {
      const from = businessDayStartUtc(new Date(), timezone)
      const { data, error } = await supabase
        .from('v_sale_summary')
        .select('*')
        .eq('business_id', business!.id)
        .gte('completed_at', from)
        .order('completed_at', { ascending: false })
        .limit(40)

      if (error) {
        console.error("[today's sales] failed", error)
        throw error
      }
      return (data ?? []) as SaleSummaryRow[]
    },
    enabled: enabled && !!business,
    staleTime: 15_000,
  })
}

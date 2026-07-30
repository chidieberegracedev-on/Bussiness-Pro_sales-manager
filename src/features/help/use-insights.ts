import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { InsightCategory, InsightType } from '@/types/database'

export interface Insight {
  type: InsightType
  category: InsightCategory
  text: string
}

/**
 * Coaching insights, derived server-side from data the app already captures.
 * The RPC gates categories by role (margin/expense/cash are owner/manager
 * only), respects business timezone and the voided-sale exclusion, and reads
 * cost snapshots rather than recomputing them.
 */
export function useInsights() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['insights', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('business_insights', {
        p_business_id: business!.id,
      })
      if (error) throw error
      return (data ?? []) as unknown as Insight[]
    },
    enabled: !!business,
    staleTime: 5 * 60_000,
  })
}

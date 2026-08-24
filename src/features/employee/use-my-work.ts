import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { businessDayStartUtc } from '@/lib/format'
import type { Database } from '@/types/database'

export type ShiftRow = Database['public']['Tables']['cash_shifts']['Row']
export type SaleSummaryRow = Database['public']['Views']['v_sale_summary']['Row']

/**
 * Which member row "me" is.
 *
 * A PIN-unlocked operator is the session's member; without an operator session
 * the person at the keyboard is the account holder, whose membership is the
 * active one. Everything in the Employee Workspace hangs off this single
 * answer, so it lives in one place rather than being re-derived per screen.
 */
export function useMyMemberId(): string | null {
  const context = useEmployeeSessionStore((s) => s.context)
  const { membership } = useActiveBusiness()
  if (context?.status === 'active') return context.member_id
  return membership?.id ?? null
}

/**
 * The sales this person rang up.
 *
 * `sales.sold_by` is the accountability link the whole control layer depends
 * on, so this is a read over existing data — no new table, and no way for the
 * number here to disagree with what management sees.
 */
export function useMySales(days = 7) {
  const { business } = useActiveBusiness()
  const memberId = useMyMemberId()
  const timezone = business?.timezone ?? 'UTC'

  return useQuery({
    queryKey: ['my-work', 'sales', business?.id, memberId, days],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - (days - 1))
      const from = businessDayStartUtc(since, timezone)

      const { data, error } = await supabase
        .from('v_sale_summary')
        .select('*')
        .eq('business_id', business!.id)
        .eq('sold_by', memberId!)
        .gte('completed_at', from)
        .order('completed_at', { ascending: false })
        .limit(200)

      if (error) {
        console.error('[my sales] failed', error)
        throw error
      }
      return (data ?? []) as SaleSummaryRow[]
    },
    enabled: !!business && !!memberId,
  })
}

/** Shifts this person opened, newest first. */
export function useMyShifts(limit = 20) {
  const { business } = useActiveBusiness()
  const memberId = useMyMemberId()

  return useQuery({
    queryKey: ['my-work', 'shifts', business?.id, memberId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('business_id', business!.id)
        .eq('opened_by', memberId!)
        .order('opened_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[my shifts] failed', error)
        throw error
      }
      return (data ?? []) as ShiftRow[]
    },
    enabled: !!business && !!memberId,
  })
}

export interface MyTotals {
  todayCount: number
  todayValue: Decimal
  rangeCount: number
  rangeValue: Decimal
  averageSale: Decimal
  voidedCount: number
}

/**
 * Totals derived from the sales list rather than fetched separately, so the
 * headline number and the list beneath it can never disagree.
 *
 * Voided sales are excluded from money totals and counted separately — a void
 * is not revenue, but hiding it entirely would remove the one figure a
 * cashier might need to explain.
 */
export function summariseSales(rows: SaleSummaryRow[], timezone: string): MyTotals {
  const todayFrom = businessDayStartUtc(new Date(), timezone)
  let todayCount = 0
  let todayValue = new Decimal(0)
  let rangeCount = 0
  let rangeValue = new Decimal(0)
  let voidedCount = 0

  for (const row of rows) {
    if (row.status !== 'completed') {
      voidedCount += 1
      continue
    }
    const total = new Decimal(row.grand_total)
    rangeCount += 1
    rangeValue = rangeValue.plus(total)
    if (row.completed_at >= todayFrom) {
      todayCount += 1
      todayValue = todayValue.plus(total)
    }
  }

  return {
    todayCount,
    todayValue,
    rangeCount,
    rangeValue,
    averageSale: rangeCount > 0 ? rangeValue.div(rangeCount) : new Decimal(0),
    voidedCount,
  }
}

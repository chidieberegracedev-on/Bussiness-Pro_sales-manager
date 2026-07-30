import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'

export interface ShiftCashSummary {
  cashIn: string
  bankIn: string
  cashOut: string
  drawerCash: Decimal
}

/**
 * The cashier's own drawer figures for the current shift, projected from the
 * shift's financial events. Deliberately scoped to this shift only — no
 * business-wide totals reach the Registry (BR-C2.2).
 *
 * Note this is NOT the blind-close expected figure: `close_shift` computes that
 * server-side at close time and it stays hidden until the count is submitted.
 * This is the running drawer total the cashier is allowed to see as they work.
 */
export function useShiftCashSummary(shiftId: string | undefined) {
  return useQuery({
    queryKey: ['shift-cash-summary', shiftId],
    queryFn: async (): Promise<ShiftCashSummary> => {
      const { data, error } = await supabase
        .from('financial_events')
        .select('account, direction, amount, event_type')
        .eq('shift_id', shiftId!)
      if (error) throw error

      let cashIn = new Decimal(0)
      let bankIn = new Decimal(0)
      let cashOut = new Decimal(0)
      let drawer = new Decimal(0)

      for (const row of data ?? []) {
        const amount = new Decimal(row.amount)
        if (row.account === 'cash') {
          if (row.direction === 'credit') {
            drawer = drawer.plus(amount)
            // The opening float is a credit too, but it is not "cash taken".
            if (row.event_type !== 'float_open') cashIn = cashIn.plus(amount)
          } else {
            drawer = drawer.minus(amount)
            cashOut = cashOut.plus(amount)
          }
        } else if (row.account === 'bank' && row.direction === 'credit') {
          bankIn = bankIn.plus(amount)
        }
      }

      return {
        cashIn: cashIn.toFixed(4),
        bankIn: bankIn.toFixed(4),
        cashOut: cashOut.toFixed(4),
        drawerCash: drawer,
      }
    },
    enabled: !!shiftId,
    staleTime: 15_000,
  })
}

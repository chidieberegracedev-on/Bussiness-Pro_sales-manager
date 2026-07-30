import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { ActivitySeverity, Database, MemberRole } from '@/types/database'

export type ActivityRow = Database['public']['Views']['v_activity_feed']['Row']
export type ShiftDiscrepancyRow = Database['public']['Views']['v_shift_discrepancies']['Row']

export interface ActivityFilters {
  severity?: ActivitySeverity | 'all'
  shiftId?: string
  memberId?: string
  from?: string
  to?: string
}

export function useActivityFeed(filters: ActivityFilters = {}, limit = 200) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['activity-feed', business?.id, filters, limit],
    queryFn: async () => {
      let q = supabase
        .from('v_activity_feed')
        .select('*')
        .eq('business_id', business!.id)
        .order('occurred_at', { ascending: false })
        .limit(limit)
      if (filters.severity && filters.severity !== 'all') q = q.eq('severity', filters.severity)
      if (filters.shiftId) q = q.eq('shift_id', filters.shiftId)
      if (filters.memberId) q = q.eq('initiated_by', filters.memberId)
      if (filters.from) q = q.gte('occurred_at', filters.from)
      if (filters.to) q = q.lte('occurred_at', filters.to)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ActivityRow[]
    },
    enabled: !!business,
    staleTime: 20_000,
  })
}

export interface LiveShift {
  id: string
  opened_at: string
  opening_float: string
  operator_name: string | null
  operator_role: MemberRole | null
  terminal_name: string | null
  drawer_cash: string
  cash_in: string
  bank_in: string
  cash_out: string
  exception_count: number
  basket_count: number
}

/**
 * Live shifts, with the operator resolved from the activity ledger.
 *
 * `cash_shifts.opened_by` holds auth.uid() — the device account the till is
 * logged in as — so it names the owner rather than the cashier who actually
 * opened the drawer. The true operator and terminal come from the `shift_opened`
 * activity event, where the actor was resolved server-side from the PIN session
 * token. That is the identity spine; this view of it needs no schema change.
 */
export function useLiveShifts() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['live-shifts', business?.id],
    queryFn: async (): Promise<LiveShift[]> => {
      const { data: shifts, error } = await supabase
        .from('cash_shifts')
        .select('id, opened_at, opening_float, terminal_id')
        .eq('business_id', business!.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: true })
      if (error) throw error
      if (!shifts || shifts.length === 0) return []

      const shiftIds = shifts.map((s) => s.id)

      // Who opened each shift, and on which terminal.
      const { data: openEvents } = await supabase
        .from('v_activity_feed')
        .select('shift_id, initiated_by_name, initiated_by_role, terminal_name, severity')
        .eq('business_id', business!.id)
        .in('shift_id', shiftIds)

      // The drawer figures, projected from this shift's cash events.
      const { data: events } = await supabase
        .from('financial_events')
        .select('shift_id, account, direction, amount, event_type')
        .in('shift_id', shiftIds)

      // Baskets currently parked against each shift.
      const { data: baskets } = await supabase
        .from('held_baskets')
        .select('shift_id')
        .eq('business_id', business!.id)
        .eq('status', 'held')
        .in('shift_id', shiftIds)

      return shifts.map((shift) => {
        const shiftEvents = (openEvents ?? []).filter((e) => e.shift_id === shift.id)
        const opener = shiftEvents.find((e) => !!e.initiated_by_name)
        const exceptionCount = shiftEvents.filter((e) => e.severity === 'exception').length

        let drawer = new Decimal(0)
        let cashIn = new Decimal(0)
        let bankIn = new Decimal(0)
        let cashOut = new Decimal(0)
        for (const event of (events ?? []).filter((e) => e.shift_id === shift.id)) {
          const amount = new Decimal(event.amount)
          if (event.account === 'cash') {
            if (event.direction === 'credit') {
              drawer = drawer.plus(amount)
              if (event.event_type !== 'float_open') cashIn = cashIn.plus(amount)
            } else {
              drawer = drawer.minus(amount)
              cashOut = cashOut.plus(amount)
            }
          } else if (event.account === 'bank' && event.direction === 'credit') {
            bankIn = bankIn.plus(amount)
          }
        }

        return {
          id: shift.id,
          opened_at: shift.opened_at,
          opening_float: shift.opening_float,
          operator_name: opener?.initiated_by_name ?? null,
          operator_role: opener?.initiated_by_role ?? null,
          terminal_name: opener?.terminal_name ?? null,
          drawer_cash: drawer.toFixed(4),
          cash_in: cashIn.toFixed(4),
          bank_in: bankIn.toFixed(4),
          cash_out: cashOut.toFixed(4),
          exception_count: exceptionCount,
          basket_count: (baskets ?? []).filter((b) => b.shift_id === shift.id).length,
        }
      })
    },
    enabled: !!business,
    // A monitor should feel live without hammering the database.
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

export function useShiftDiscrepancies(limit = 100) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['shift-discrepancies', business?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_shift_discrepancies')
        .select('*')
        .eq('business_id', business!.id)
        .order('closed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as ShiftDiscrepancyRow[]
    },
    enabled: !!business,
  })
}

/** Human labels for the action_type values the RPCs emit. */
export const ACTION_TYPE_LABELS: Record<string, string> = {
  session_opened: 'Signed in',
  session_resumed: 'Resumed session',
  pin_failed: 'Wrong PIN entered',
  pin_locked: 'PIN locked out',
  manager_override: 'Manager approved',
  override_denied: 'Approval refused',
  basket_voided: 'Basket cleared',
  line_voided: 'Item removed',
  basket_held: 'Basket held',
  basket_resumed: 'Basket resumed',
  basket_transferred: 'Basket moved to another till',
  basket_discarded: 'Held basket discarded',
  sale_completed: 'Sale completed',
  goods_received: 'Stock received',
  petty_cash_out: 'Petty cash paid out',
  safe_drop: 'Cash moved to safe',
  shift_opened: 'Shift opened',
  shift_closed: 'Shift closed',
  inventory_adjusted: 'Stock adjusted',
  discount_authorized: 'Discount approved',
  refund_authorized: 'Refund approved',
  void_authorized: 'Void approved',
  petty_cash_authorized: 'Petty cash approved',
  safe_drop_authorized: 'Safe drop approved',
  inventory_adjustment_authorized: 'Stock adjustment approved',
}

export function actionLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] ?? actionType.replace(/_/g, ' ')
}

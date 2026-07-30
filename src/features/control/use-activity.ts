import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { ActivitySeverity, Database } from '@/types/database'

export type ActivityRow = Database['public']['Views']['v_activity_feed']['Row']
export type LiveShiftRow = Database['public']['Views']['v_live_shifts']['Row']
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

export function useLiveShifts() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['live-shifts', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_live_shifts')
        .select('*')
        .eq('business_id', business!.id)
        .order('opened_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as LiveShiftRow[]
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

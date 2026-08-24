import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { MemberRole } from '@/types/database'

export type AnalyticsPeriod = 'today' | 'week' | 'month' | 'quarter'

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  quarter: 'Last 90 days',
}

const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  today: 0,
  week: 6,
  month: 29,
  quarter: 89,
}

/**
 * How a sale is attributed to a person.
 *
 * `sales.sold_by` cannot answer this today: complete_sale writes auth.uid()
 * into it, which is the BUSINESS account the till is signed in as, not the
 * cashier who rang the sale. Grouping by it puts every sale in one bucket
 * under the owner's name — a number that looks like analytics and is worthless.
 * The actor-aware complete_sale coming in 12C fixes that at the source.
 *
 * Until then attribution is DERIVED through the identity spine that already
 * records the real operator:
 *
 *   sale -> financial_events (reference_type='sale')  -> shift_id
 *        -> activity_events  (action_type='shift_opened', same shift)
 *        -> initiated_by     -> business_members       -> the operator
 *
 * `shift_opened` is emitted through record_activity_as_actor, which resolves
 * the actor server-side from the PIN session token, so it names the person at
 * the drawer. One shift is open per location at a time, so a sale rung during
 * a shift belongs to whoever opened it.
 *
 * The honest limits of that, surfaced in the UI rather than hidden:
 *   - a sale rung with no shift open cannot be attributed at all
 *   - a shift opened before employee mode was switched on has no actor event
 * Both land in the `unattributed` bucket and are shown as their own row.
 */
export type AttributionBasis = 'shift'

export interface EmployeeStats {
  member_id: string
  name: string
  role: MemberRole | null
  /** Completed, non-voided sales attributed to this operator. */
  sale_count: number
  revenue: string
  gross_profit: string
  unit_count: number
  /** revenue / sale_count, '0' when there are no sales. */
  average_sale: string
  /** Sales that were voided after completion. */
  void_count: number
  /** Approvals this operator had to ask for (discount / refund / void). */
  override_count: number
  exception_count: number
  shift_count: number
  /** Sum of (closed_at - opened_at) across closed shifts, in hours. */
  hours_worked: number
  /** Net counted-minus-expected across this operator's closed shifts. */
  cash_variance: string
  shifts_short: number
  shifts_over: number
}

export interface EmployeeAnalytics {
  basis: AttributionBasis
  from: string
  to: string
  rows: EmployeeStats[]
  /** Sales in the period that no operator could be resolved for. */
  unattributed: { sale_count: number; revenue: string }
  totals: {
    sale_count: number
    revenue: string
    gross_profit: string
    average_sale: string
    attributed_pct: number
  }
}

function emptyStats(memberId: string, name: string, role: MemberRole | null): EmployeeStats {
  return {
    member_id: memberId,
    name,
    role,
    sale_count: 0,
    revenue: '0',
    gross_profit: '0',
    unit_count: 0,
    average_sale: '0',
    void_count: 0,
    override_count: 0,
    exception_count: 0,
    shift_count: 0,
    hours_worked: 0,
    cash_variance: '0',
    shifts_short: 0,
    shifts_over: 0,
  }
}

/** Action types that mean "this operator needed someone senior to approve". */
const OVERRIDE_ACTIONS = new Set([
  'manager_override',
  'discount_authorized',
  'refund_authorized',
  'void_authorized',
  'petty_cash_authorized',
  'safe_drop_authorized',
  'inventory_adjustment_authorized',
])

/**
 * Management-side employee analytics. Read-derived from data that already
 * exists — no new table, no new write path, nothing recorded for this screen's
 * benefit. It is deliberately absent from /me and the cashier surface: an
 * employee sees their own work there, comparison lives here.
 */
export function useEmployeeAnalytics(period: AnalyticsPeriod) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['employee-analytics', business?.id, period],
    queryFn: async (): Promise<EmployeeAnalytics> => {
      const businessId = business!.id

      // Period boundaries in BUSINESS time, never the browser's. The helper is
      // the same one every other date bucket in the app goes through.
      const { data: fromRaw, error: fromError } = await supabase.rpc('business_day_start', {
        p_business_id: businessId,
        p_days_offset: -PERIOD_DAYS[period],
      })
      if (fromError) throw fromError
      const from = fromRaw as unknown as string
      const to = new Date().toISOString()

      // ---- 1. The people ----------------------------------------------------
      const { data: operators, error: operatorError } = await supabase
        .from('v_operators')
        .select('member_id, display_name, role, status')
        .eq('business_id', businessId)
      if (operatorError) throw operatorError

      const stats = new Map<string, EmployeeStats>()
      for (const op of operators ?? []) {
        stats.set(
          op.member_id,
          emptyStats(op.member_id, op.display_name ?? 'Unnamed', op.role as MemberRole | null),
        )
      }

      // ---- 2. Shifts in the period, and who opened each ---------------------
      const { data: shifts, error: shiftError } = await supabase
        .from('cash_shifts')
        .select('id, opened_at, closed_at, status, counted_cash, expected_cash, variance')
        .eq('business_id', businessId)
        .gte('opened_at', from)
      if (shiftError) throw shiftError

      const shiftIds = (shifts ?? []).map((s) => s.id)

      // ---- 3. The activity trail for those shifts ---------------------------
      // One read covers three questions: who opened each shift, who needed an
      // approval, and where the exceptions were.
      const { data: events, error: eventError } = shiftIds.length
        ? await supabase
            .from('v_activity_feed')
            .select('action_type, severity, initiated_by, initiated_by_name, initiated_by_role, shift_id')
            .eq('business_id', businessId)
            .in('shift_id', shiftIds)
        : { data: [], error: null }
      if (eventError) throw eventError

      /** shift id -> the member who opened it. */
      const shiftOperator = new Map<string, string>()
      for (const event of events ?? []) {
        if (!event.shift_id || !event.initiated_by) continue
        if (event.action_type !== 'shift_opened') continue
        if (!shiftOperator.has(event.shift_id)) {
          shiftOperator.set(event.shift_id, event.initiated_by)
          // An operator who worked but was later archived still owns their
          // numbers; v_operators may no longer list them.
          if (!stats.has(event.initiated_by)) {
            stats.set(
              event.initiated_by,
              emptyStats(
                event.initiated_by,
                event.initiated_by_name ?? 'Former employee',
                (event.initiated_by_role as MemberRole | null) ?? null,
              ),
            )
          }
        }
      }

      // ---- 4. Sales in the period, and the shift each was rung on -----------
      const { data: sales, error: saleError } = await supabase
        .from('v_sale_summary')
        .select('id, status, grand_total, gross_profit, unit_count, completed_at')
        .eq('business_id', businessId)
        .gte('completed_at', from)
      if (saleError) throw saleError

      const saleIds = (sales ?? []).map((s) => s.id)

      // financial_events is what actually carries the sale -> shift link;
      // `sales` has no shift_id column of its own.
      const { data: saleLinks, error: linkError } = saleIds.length
        ? await supabase
            .from('financial_events')
            .select('reference_id, shift_id')
            .eq('business_id', businessId)
            .eq('reference_type', 'sale')
            .in('reference_id', saleIds)
        : { data: [], error: null }
      if (linkError) throw linkError

      const saleShift = new Map<string, string>()
      for (const link of saleLinks ?? []) {
        if (link.reference_id && link.shift_id && !saleShift.has(link.reference_id)) {
          saleShift.set(link.reference_id, link.shift_id)
        }
      }

      // ---- 5. Fold the sales in ---------------------------------------------
      let unattributedCount = 0
      let unattributedRevenue = new Decimal(0)
      let totalRevenue = new Decimal(0)
      let totalProfit = new Decimal(0)
      let totalSales = 0

      for (const sale of sales ?? []) {
        const shiftId = saleShift.get(sale.id)
        const memberId = shiftId ? shiftOperator.get(shiftId) : undefined
        const row = memberId ? stats.get(memberId) : undefined

        if (sale.status === 'voided') {
          if (row) row.void_count += 1
          continue
        }
        if (sale.status !== 'completed') continue

        const revenue = new Decimal(sale.grand_total ?? '0')
        const profit = new Decimal(sale.gross_profit ?? '0')
        totalRevenue = totalRevenue.plus(revenue)
        totalProfit = totalProfit.plus(profit)
        totalSales += 1

        if (!row) {
          unattributedCount += 1
          unattributedRevenue = unattributedRevenue.plus(revenue)
          continue
        }

        row.sale_count += 1
        row.revenue = new Decimal(row.revenue).plus(revenue).toFixed(4)
        row.gross_profit = new Decimal(row.gross_profit).plus(profit).toFixed(4)
        row.unit_count += Number(sale.unit_count ?? 0)
      }

      // ---- 6. Fold the shifts in --------------------------------------------
      for (const shift of shifts ?? []) {
        const memberId = shiftOperator.get(shift.id)
        const row = memberId ? stats.get(memberId) : undefined
        if (!row) continue

        row.shift_count += 1
        if (shift.closed_at) {
          const hours =
            (new Date(shift.closed_at).getTime() - new Date(shift.opened_at).getTime()) / 3_600_000
          if (hours > 0) row.hours_worked += hours
        }
        if (shift.status === 'closed' && shift.variance != null) {
          const variance = new Decimal(shift.variance)
          row.cash_variance = new Decimal(row.cash_variance).plus(variance).toFixed(4)
          if (variance.lt(0)) row.shifts_short += 1
          else if (variance.gt(0)) row.shifts_over += 1
        }
      }

      // ---- 7. Fold the approvals and exceptions in ---------------------------
      for (const event of events ?? []) {
        if (!event.initiated_by) continue
        const row = stats.get(event.initiated_by)
        if (!row) continue
        if (event.severity === 'exception') row.exception_count += 1
        if (OVERRIDE_ACTIONS.has(event.action_type)) row.override_count += 1
      }

      // ---- 8. Derived figures ------------------------------------------------
      for (const row of stats.values()) {
        row.average_sale =
          row.sale_count > 0
            ? new Decimal(row.revenue).dividedBy(row.sale_count).toFixed(4)
            : '0'
        row.hours_worked = Math.round(row.hours_worked * 10) / 10
      }

      // Someone with no sales AND no shifts in the period did not work it —
      // listing them as a row of zeroes reads as "sold nothing", which is a
      // different claim. Drop them.
      const rows = [...stats.values()]
        .filter((r) => r.sale_count > 0 || r.shift_count > 0 || r.void_count > 0)
        .sort((a, b) => new Decimal(b.revenue).comparedTo(new Decimal(a.revenue)))

      return {
        basis: 'shift',
        from,
        to,
        rows,
        unattributed: {
          sale_count: unattributedCount,
          revenue: unattributedRevenue.toFixed(4),
        },
        totals: {
          sale_count: totalSales,
          revenue: totalRevenue.toFixed(4),
          gross_profit: totalProfit.toFixed(4),
          average_sale: totalSales > 0 ? totalRevenue.dividedBy(totalSales).toFixed(4) : '0',
          attributed_pct:
            totalSales > 0 ? Math.round(((totalSales - unattributedCount) / totalSales) * 100) : 100,
        },
      }
    },
    enabled: !!business,
    staleTime: 60_000,
  })
}

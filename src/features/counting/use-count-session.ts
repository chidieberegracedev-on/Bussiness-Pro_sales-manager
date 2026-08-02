import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { readToken } from '@/features/control/session-store'
import type {
  CountApprovalResult,
  CountMode,
  Database,
  MemberRole,
} from '@/types/database'

export type CountSession = Database['public']['Tables']['inventory_count_sessions']['Row']
export type CountItem = Database['public']['Tables']['inventory_count_items']['Row']

/** A count line joined to what it is, for the variance sheet. */
export interface CountRow {
  variantId: string
  productName: string
  variantName: string | null
  sku: string | null
  baseUnit: string
  expected: Decimal
  counted: Decimal | null
  avgCost: Decimal
  /** counted − expected. Null until counted. */
  variance: Decimal | null
  varianceValue: Decimal | null
}

export function useOpenCountSessions() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['count-sessions', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_count_sessions')
        .select('*')
        .eq('business_id', business!.id)
        .order('opened_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as CountSession[]
    },
    enabled: !!business,
  })
}

export function useCountSession(sessionId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['count-session', business?.id, sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_count_sessions')
        .select('*')
        .eq('id', sessionId!)
        .single()
      if (error) throw error
      return data as CountSession
    },
    enabled: !!business && !!sessionId,
  })
}

/**
 * The variance sheet.
 *
 * expected_qty and avg_cost_snapshot come from the SNAPSHOT taken when the
 * session opened — never from live inventory. That is what makes the count
 * honest: sales and receiving carrying on during the count cannot move the
 * number being counted against.
 */
export function useCountItems(sessionId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['count-items', business?.id, sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_count_items')
        .select(
          'variant_id, expected_qty, counted_qty, avg_cost_snapshot, product_variants(variant_name, sku, products(name, base_unit))',
        )
        .eq('session_id', sessionId!)
      if (error) throw error

      type Raw = {
        variant_id: string
        expected_qty: string
        counted_qty: string | null
        avg_cost_snapshot: string
        product_variants: {
          variant_name: string | null
          sku: string | null
          products: { name: string; base_unit: string } | null
        } | null
      }

      return ((data ?? []) as unknown as Raw[])
        .map((r): CountRow => {
          const expected = new Decimal(r.expected_qty)
          const counted = r.counted_qty === null ? null : new Decimal(r.counted_qty)
          const avgCost = new Decimal(r.avg_cost_snapshot)
          const variance = counted ? counted.minus(expected) : null
          return {
            variantId: r.variant_id,
            productName: r.product_variants?.products?.name ?? 'Unknown product',
            variantName: r.product_variants?.variant_name ?? null,
            sku: r.product_variants?.sku ?? null,
            baseUnit: r.product_variants?.products?.base_unit ?? 'unit',
            expected,
            counted,
            avgCost,
            variance,
            varianceValue: variance ? variance.times(avgCost) : null,
          }
        })
        .sort((a, b) => a.productName.localeCompare(b.productName))
    },
    enabled: !!business && !!sessionId,
  })
}

export function useOpenCountSession() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      locationId: string
      mode: CountMode
      isBlind: boolean
      variantIds?: string[] | null
    }) => {
      const sessionId = crypto.randomUUID()
      const { data, error } = await supabase.rpc('open_count_session', {
        p_session_id: sessionId,
        p_business_id: business!.id,
        p_location_id: input.locationId,
        p_mode: input.mode,
        p_is_blind: input.isBlind,
        p_variant_ids: input.variantIds ?? null,
      })
      if (error) {
        console.error('[open_count_session] failed', { input, error })
        throw error
      }
      return data as unknown as CountSession
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['count-sessions', business?.id] }),
  })
}

export function useRecordCount(sessionId: string | undefined) {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { variantId: string; countedQty: Decimal }) => {
      const { error } = await supabase.rpc('record_count', {
        p_session_id: sessionId!,
        p_variant_id: input.variantId,
        // numeric arg as a decimal string — a float here would round a count.
        p_counted_qty: input.countedQty.toString() as unknown as number,
      })
      if (error) {
        console.error('[record_count] failed', { input, error })
        throw error
      }
    },
    // Optimistic: a scan-driven count must feel instant, and the running total
    // is authoritative on the client until the server confirms it.
    onMutate: async ({ variantId, countedQty }) => {
      const key = ['count-items', business?.id, sessionId]
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CountRow[]>(key)
      qc.setQueryData<CountRow[]>(key, (rows) =>
        (rows ?? []).map((r) =>
          r.variantId === variantId
            ? {
                ...r,
                counted: countedQty,
                variance: countedQty.minus(r.expected),
                varianceValue: countedQty.minus(r.expected).times(r.avgCost),
              }
            : r,
        ),
      )
      return { previous, key }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['count-items', business?.id, sessionId] })
      qc.invalidateQueries({ queryKey: ['count-session', business?.id, sessionId] })
    },
  })
}

/**
 * Manager-PIN-gated approval.
 *
 * Note the shape: a wrong PIN comes back as `{approved:false, reason:'bad_pin'}`
 * rather than as a thrown error. 0023 changed it deliberately — raising would
 * roll back the denial audit record written in the same transaction, and a
 * failed approval on a stock count is exactly the event the Exceptions Center
 * needs to see. So failure has to commit, which means it has to return.
 */
export function useApproveCountSession() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      sessionId: string
      approverMemberId: string
      approverPin: string
    }) => {
      const { data, error } = await supabase.rpc('approve_count_session', {
        p_session_id: input.sessionId,
        p_approver_member_id: input.approverMemberId,
        p_approver_pin: input.approverPin,
        p_actor_token: readToken(),
      })
      if (error) {
        console.error('[approve_count_session] failed', {
          sessionId: input.sessionId,
          error,
        })
        throw error
      }
      return data as unknown as CountApprovalResult
    },
    onSuccess: (result) => {
      if (!result.approved) return
      // An approved count moves inventory, cost, and the P&L. Nothing that
      // reads any of those may keep a stale copy.
      qc.invalidateQueries({ queryKey: ['count-sessions', business?.id] })
      qc.invalidateQueries({ queryKey: ['count-session', business?.id] })
      qc.invalidateQueries({ queryKey: ['count-items', business?.id] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['financial-position', business?.id] })
      qc.invalidateQueries({ queryKey: ['expenses', business?.id] })
      qc.invalidateQueries({ queryKey: ['activity', business?.id] })
    },
  })
}

export function useCancelCountSession() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc('cancel_count_session', { p_session_id: sessionId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['count-sessions', business?.id] })
      qc.invalidateQueries({ queryKey: ['count-session', business?.id] })
    },
  })
}

export const COUNT_MODE_LABELS: Record<CountMode, string> = {
  cycle: 'Cycle count',
  blind: 'Blind count',
  aisle: 'By aisle',
  category: 'By category',
  supplier: 'By supplier',
  zone: 'By zone',
  full: 'Full stocktake',
  recount: 'Recount',
}

export const APPROVER_ROLES: MemberRole[] = ['owner', 'manager']

export function summariseVariance(rows: CountRow[]) {
  let countedLines = 0
  let overLines = 0
  let shortLines = 0
  let shrinkage = new Decimal(0)
  let gain = new Decimal(0)

  for (const row of rows) {
    if (row.counted === null || !row.variance) continue
    countedLines += 1
    if (row.variance.isNegative()) {
      shortLines += 1
      shrinkage = shrinkage.plus(row.variance.abs().times(row.avgCost))
    } else if (row.variance.isPositive()) {
      overLines += 1
      gain = gain.plus(row.variance.times(row.avgCost))
    }
  }

  return {
    total: rows.length,
    countedLines,
    uncounted: rows.length - countedLines,
    overLines,
    shortLines,
    /** Only losses hit the P&L — the server writes off shortage, not surplus. */
    shrinkage,
    gain,
    net: gain.minus(shrinkage),
  }
}

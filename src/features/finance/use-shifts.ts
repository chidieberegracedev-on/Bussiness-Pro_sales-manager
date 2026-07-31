import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { readSessionContext, getTerminalId } from '@/features/control/session-store'
import { recordActorActivity } from '@/features/control/activity'
import type { Database } from '@/types/database'

export type CashShift = Database['public']['Tables']['cash_shifts']['Row']

export interface ShiftRow extends CashShift {
  opened_by_name: string | null
  closed_by_name: string | null
}

export function useShifts(limit = 50) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['shifts', business?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*, opener:profiles!cash_shifts_opened_by_fkey(full_name), closer:profiles!cash_shifts_closed_by_fkey(full_name)')
        .eq('business_id', business!.id)
        .order('opened_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      type Raw = CashShift & {
        opener: { full_name: string | null } | null
        closer: { full_name: string | null } | null
      }
      return ((data ?? []) as unknown as Raw[]).map(
        (r): ShiftRow => ({
          ...r,
          opened_by_name: r.opener?.full_name ?? null,
          closed_by_name: r.closer?.full_name ?? null,
        }),
      )
    },
    enabled: !!business,
  })
}

export function useShift(id: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['shift', business?.id, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*, opener:profiles!cash_shifts_opened_by_fkey(full_name), closer:profiles!cash_shifts_closed_by_fkey(full_name)')
        .eq('id', id!)
        .eq('business_id', business!.id)
        .single()
      if (error) throw error
      type Raw = CashShift & {
        opener: { full_name: string | null } | null
        closer: { full_name: string | null } | null
      }
      const r = data as unknown as Raw
      return {
        ...r,
        opened_by_name: r.opener?.full_name ?? null,
        closed_by_name: r.closer?.full_name ?? null,
      } as ShiftRow
    },
    enabled: !!business && !!id,
  })
}

/**
 * Returns the currently-open shift for the given location, or null.
 * Used by POS to auto-attach cash sales to the drawer.
 */
export function useOpenShift(locationId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['open-shift', business?.id, locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('business_id', business!.id)
        .eq('location_id', locationId!)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as CashShift | null
    },
    enabled: !!business && !!locationId,
    staleTime: 15_000,
  })
}

export function useOpenShiftMutation() {
  const { business, membership, isMultiOperator } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { locationId: string; openingFloat: string }) => {
      // In employee mode a shift belongs to an employee on a terminal: without a
      // resolved operator session there is nobody to hold it accountable, so
      // refuse. On your own, there is exactly one person it could be — the
      // drawer still gets counted, it just doesn't need a PIN to say whose.
      const ctx = readSessionContext()
      const terminalId = getTerminalId()
      if (isMultiOperator) {
        if (!ctx || ctx.status !== 'active') {
          throw new Error('Sign in with your PIN before opening a shift.')
        }
        if (!terminalId) {
          throw new Error('This device is not registered as a terminal yet.')
        }
      }

      const shiftId = crypto.randomUUID()
      const floatDecimal = new Decimal(input.openingFloat || '0')
      const { data, error } = await supabase.rpc('open_shift', {
        p_shift_id: shiftId,
        p_business_id: business!.id,
        p_location_id: input.locationId,
        // numeric-typed RPC arg — pass a decimal string so precision survives
        // and JS float coercion never sneaks in (Fix 009 §Issue 3 cause B).
        p_opening_float: floatDecimal.toString() as unknown as number,
      })
      if (error) {
        console.error('[open_shift] failed', { input, error })
        throw error
      }
      const shift = data as CashShift

      // open_shift stamps opened_by with auth.uid() — the device account, not
      // the PIN operator — and cash_shifts has no client write policy for
      // terminal_id. So the real operator and terminal are recorded on the
      // activity ledger, where the actor is resolved from the session token
      // server-side. Every shift view reads the operator from here.
      await recordActorActivity({
        businessId: business!.id,
        actionType: 'shift_opened',
        fallbackMemberId: membership?.id ?? null,
        terminalId,
        shiftId: shift.id,
        referenceType: 'shift',
        referenceId: shift.id,
        detail: {
          opening_float: floatDecimal.toString(),
          operator: ctx?.display_name ?? membership?.display_name ?? '',
          terminal: ctx?.terminal_name ?? '',
        },
      })

      return shift
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['shifts', business?.id] })
      qc.invalidateQueries({ queryKey: ['open-shift', business?.id, variables.locationId] })
    },
  })
}

export function useCloseShiftMutation() {
  const { business, membership } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { shiftId: string; countedCash: string; note?: string }) => {
      const trimmed = input.countedCash.trim()
      if (!trimmed || Number.isNaN(Number(trimmed))) {
        throw new Error('Enter a counted amount before closing the shift.')
      }
      const countedDecimal = new Decimal(trimmed)
      const { data, error } = await supabase.rpc('close_shift', {
        p_shift_id: input.shiftId,
        // Send as decimal string — the RPC's numeric arg accepts it via
        // PostgREST cast, and this avoids any JS number-precision loss on
        // large amounts (Fix 009 §Issue 3 cause C).
        p_counted_cash: countedDecimal.toString() as unknown as number,
        p_note: input.note ?? null,
      })
      if (error) {
        console.error('[close_shift] failed', { input, error })
        throw error
      }
      const closed = data as CashShift

      const ctx = readSessionContext()
      await recordActorActivity({
        businessId: business!.id,
        actionType: 'shift_closed',
        fallbackMemberId: membership?.id ?? null,
        terminalId: ctx?.terminal_id ?? getTerminalId(),
        shiftId: closed.id,
        referenceType: 'shift',
        referenceId: closed.id,
        // A drawer that didn't balance is worth a human look, not an accusation.
        severity: closed.variance && Number(closed.variance) !== 0 ? 'exception' : 'info',
        detail: {
          counted: closed.counted_cash ?? '',
          expected: closed.expected_cash ?? '',
          variance: closed.variance ?? '0',
        },
      })

      return closed
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['shifts', business?.id] })
      qc.invalidateQueries({ queryKey: ['shift', business?.id, variables.shiftId] })
      qc.invalidateQueries({ queryKey: ['open-shift', business?.id] })
      qc.invalidateQueries({ queryKey: ['financial-position', business?.id] })
      qc.invalidateQueries({ queryKey: ['cashbook', business?.id] })
    },
  })
}

export function useTransferCash() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      from: 'cash' | 'bank' | 'safe' | 'petty_cash'
      to: 'cash' | 'bank' | 'safe' | 'petty_cash'
      amount: string
      shiftId?: string | null
      note?: string
    }) => {
      const { error } = await supabase.rpc('transfer_cash', {
        p_event_id: crypto.randomUUID(),
        p_business_id: business!.id,
        p_from: input.from,
        p_to: input.to,
        p_amount: new Decimal(input.amount).toString() as unknown as number,
        p_shift_id: input.shiftId ?? null,
        p_note: input.note ?? null,
      })
      if (error) {
        console.error('[transfer_cash] failed', { input, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-position', business?.id] })
      qc.invalidateQueries({ queryKey: ['cashbook', business?.id] })
      qc.invalidateQueries({ queryKey: ['shifts', business?.id] })
      qc.invalidateQueries({ queryKey: ['open-shift', business?.id] })
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
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
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { locationId: string; openingFloat: string }) => {
      const shiftId = crypto.randomUUID()
      const { data, error } = await supabase.rpc('open_shift', {
        p_shift_id: shiftId,
        p_business_id: business!.id,
        p_location_id: input.locationId,
        p_opening_float: Number(input.openingFloat || '0'),
      })
      if (error) {
        console.error('[open_shift] failed', { input, error })
        throw error
      }
      return data as CashShift
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['shifts', business?.id] })
      qc.invalidateQueries({ queryKey: ['open-shift', business?.id, variables.locationId] })
    },
  })
}

export function useCloseShiftMutation() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { shiftId: string; countedCash: string; note?: string }) => {
      const { data, error } = await supabase.rpc('close_shift', {
        p_shift_id: input.shiftId,
        p_counted_cash: Number(input.countedCash),
        p_note: input.note ?? null,
      })
      if (error) {
        console.error('[close_shift] failed', { input, error })
        throw error
      }
      return data as CashShift
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
        p_amount: Number(input.amount),
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

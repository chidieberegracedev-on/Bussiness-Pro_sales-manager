import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { readSessionContext, readToken } from '@/features/control/session-store'
import { cartSubtotal, type CartLine } from '@/features/pos/cart-store'
import type { Database } from '@/types/database'

export type HeldBasket = Database['public']['Tables']['held_baskets']['Row']

/** Wire shape of a parked cart line — Decimals become strings. */
interface SerializedLine {
  variantId: string
  productName: string
  variantName: string | null
  baseUnit: string
  unitPrice: string
  quantity: string
  movementId: string
}

function serialize(lines: CartLine[]): SerializedLine[] {
  return lines.map((l) => ({
    variantId: l.variantId,
    productName: l.productName,
    variantName: l.variantName,
    baseUnit: l.baseUnit,
    unitPrice: l.unitPrice.toString(),
    quantity: l.quantity.toString(),
    movementId: l.movementId,
  }))
}

export function deserialize(basket: unknown): CartLine[] {
  if (!Array.isArray(basket)) return []
  return (basket as SerializedLine[]).map((l) => ({
    variantId: l.variantId,
    productName: l.productName,
    variantName: l.variantName,
    baseUnit: l.baseUnit,
    unitPrice: new Decimal(l.unitPrice),
    quantity: new Decimal(l.quantity),
    movementId: l.movementId,
  }))
}

export function useHeldBaskets(search = '') {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['held-baskets', business?.id, search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('held_baskets')
        .select('*')
        .eq('business_id', business!.id)
        .eq('status', 'held')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const rows = (data ?? []) as HeldBasket[]
      const q = search.trim().toLowerCase()
      if (!q) return rows
      return rows.filter((r) => (r.label ?? '').toLowerCase().includes(q))
    },
    enabled: !!business,
    staleTime: 15_000,
  })
}

export function useHoldBasket() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { lines: CartLine[]; label?: string | null; shiftId?: string | null }) => {
      const ctx = readSessionContext()
      const total = cartSubtotal(input.lines)
      const { data, error } = await supabase
        .from('held_baskets')
        .insert({
          business_id: business!.id,
          terminal_id: ctx?.terminal_id ?? null,
          shift_id: input.shiftId ?? null,
          member_id: ctx?.member_id ?? null,
          label: input.label || null,
          basket: serialize(input.lines),
          item_count: input.lines.length,
          total: total.toFixed(4),
        })
        .select()
        .single()
      if (error) throw error

      // Attribution comes from the session token, not a client-supplied id.
      const token = readToken()
      if (token) {
        const { error: activityError } = await supabase.rpc('record_activity_as_actor', {
          p_business_id: business!.id,
          p_action_type: 'basket_held',
          p_actor_token: token,
          p_terminal_id: ctx?.terminal_id ?? null,
          p_shift_id: input.shiftId ?? null,
          p_reference_type: 'held_basket',
          p_reference_id: (data as HeldBasket).id,
          p_detail: { item_count: input.lines.length, total: total.toFixed(4) },
        })
        if (activityError) console.error('[record_activity_as_actor] failed', activityError)
      }
      return data as HeldBasket
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-baskets', business?.id] }),
  })
}

export function useResumeBasket() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (basketId: string) => {
      const { data, error } = await supabase
        .from('held_baskets')
        .update({ status: 'resumed', resumed_at: new Date().toISOString() })
        .eq('id', basketId)
        .select()
        .single()
      if (error) throw error

      const ctx = readSessionContext()
      const token = readToken()
      if (token) {
        const { error: activityError } = await supabase.rpc('record_activity_as_actor', {
          p_business_id: business!.id,
          p_action_type: 'basket_resumed',
          p_actor_token: token,
          p_terminal_id: ctx?.terminal_id ?? null,
          p_reference_type: 'held_basket',
          p_reference_id: basketId,
        })
        if (activityError) console.error('[record_activity_as_actor] failed', activityError)
      }
      return data as HeldBasket
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-baskets', business?.id] }),
  })
}

/** Move a held basket to this terminal so it can be picked up at another till. */
export function useTransferBasket() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (basketId: string) => {
      const ctx = readSessionContext()
      const { data, error } = await supabase
        .from('held_baskets')
        .update({ terminal_id: ctx?.terminal_id ?? null })
        .eq('id', basketId)
        .select()
        .single()
      if (error) throw error

      const token = readToken()
      if (token) {
        const { error: activityError } = await supabase.rpc('record_activity_as_actor', {
          p_business_id: business!.id,
          p_action_type: 'basket_transferred',
          p_actor_token: token,
          p_terminal_id: ctx?.terminal_id ?? null,
          p_reference_type: 'held_basket',
          p_reference_id: basketId,
          p_severity: 'notice',
        })
        if (activityError) console.error('[record_activity_as_actor] failed', activityError)
      }
      return data as HeldBasket
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-baskets', business?.id] }),
  })
}

export function useDiscardBasket() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (basketId: string) => {
      const { error } = await supabase
        .from('held_baskets')
        .update({ status: 'discarded' })
        .eq('id', basketId)
      if (error) throw error

      const ctx = readSessionContext()
      const token = readToken()
      if (token) {
        const { error: activityError } = await supabase.rpc('record_activity_as_actor', {
          p_business_id: business!.id,
          p_action_type: 'basket_discarded',
          p_actor_token: token,
          p_terminal_id: ctx?.terminal_id ?? null,
          p_reference_type: 'held_basket',
          p_reference_id: basketId,
          p_severity: 'notice',
        })
        if (activityError) console.error('[record_activity_as_actor] failed', activityError)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-baskets', business?.id] }),
  })
}

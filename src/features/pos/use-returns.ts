import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { readToken } from '@/features/control/session-store'

export interface ReturnableLine {
  variant_id: string
  product_name: string
  variant_name: string | null
  /** Units originally sold on this line (always positive here). */
  sold_quantity: string
  /** Units already returned across every prior return visit. */
  returned_quantity: string
  /** sold − returned: the most this visit may take back. */
  remaining: string
  /** What one unit was actually charged, net of any line discount. */
  unit_refund: string
}

export interface ReturnableSale {
  id: string
  sale_number: string
  completed_at: string
  currency_code: string
  lines: ReturnableLine[]
  /** True when every line is already fully returned. */
  fully_returned: boolean
}

/**
 * A completed sale, with each line's remaining returnable quantity resolved.
 *
 * The ceiling is computed here so the cashier sees "2 of 3 left" before they
 * pick, rather than discovering it as a server rejection after. The server
 * enforces the same ceiling regardless — this is the courtesy, not the control.
 *
 * Already-returned is summed from the child return sales (parent_sale_id =
 * this sale), which is the same derivation the server uses, so the two agree.
 */
export function useReturnableSale(saleId: string | null) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['returnable-sale', business?.id, saleId],
    queryFn: async (): Promise<ReturnableSale | null> => {
      if (!saleId) return null

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('id, sale_number, completed_at, currency_code, status, is_return')
        .eq('id', saleId)
        .eq('business_id', business!.id)
        .maybeSingle()
      if (saleError) throw saleError
      if (!sale) return null
      if (sale.status !== 'completed' || sale.is_return) {
        // Only a completed, non-return sale can be returned — the server says
        // so too; surfacing it here keeps a voided or return sale from even
        // opening the picker.
        return { ...saleHeader(sale), lines: [], fully_returned: true }
      }

      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('variant_id, product_name, variant_name, quantity, line_total')
        .eq('sale_id', saleId)
      if (itemsError) throw itemsError

      // Every return raised against this sale, with its lines, to sum what has
      // already gone back per variant.
      const { data: priorReturns, error: returnsError } = await supabase
        .from('sales')
        .select('id, sale_items(variant_id, quantity)')
        .eq('parent_sale_id', saleId)
        .eq('status', 'completed')
      if (returnsError) throw returnsError

      const alreadyReturned = new Map<string, Decimal>()
      for (const ret of (priorReturns ?? []) as Array<{
        sale_items: Array<{ variant_id: string | null; quantity: string }>
      }>) {
        for (const li of ret.sale_items ?? []) {
          if (!li.variant_id) continue
          // Return lines are stored negative; the magnitude is what came back.
          const prev = alreadyReturned.get(li.variant_id) ?? new Decimal(0)
          alreadyReturned.set(li.variant_id, prev.plus(new Decimal(li.quantity).abs()))
        }
      }

      const lines: ReturnableLine[] = []
      for (const item of (items ?? []) as Array<{
        variant_id: string | null
        product_name: string
        variant_name: string | null
        quantity: string
        line_total: string
      }>) {
        if (!item.variant_id) continue
        const sold = new Decimal(item.quantity)
        if (sold.lte(0)) continue
        const returned = alreadyReturned.get(item.variant_id) ?? new Decimal(0)
        const remaining = Decimal.max(sold.minus(returned), new Decimal(0))
        // Per-unit refund from what was actually charged (line_total is already
        // net of discount), so a discounted item refunds the discounted price.
        const unitRefund = sold.gt(0)
          ? new Decimal(item.line_total).dividedBy(sold)
          : new Decimal(0)
        lines.push({
          variant_id: item.variant_id,
          product_name: item.product_name,
          variant_name: item.variant_name,
          sold_quantity: sold.toString(),
          returned_quantity: returned.toString(),
          remaining: remaining.toString(),
          unit_refund: unitRefund.toFixed(4),
        })
      }

      return {
        ...saleHeader(sale),
        lines,
        fully_returned: lines.length > 0 && lines.every((l) => new Decimal(l.remaining).lte(0)),
      }
    },
    enabled: !!business && !!saleId,
    staleTime: 5_000,
  })
}

function saleHeader(sale: {
  id: string
  sale_number: string
  completed_at: string
  currency_code: string
}) {
  return {
    id: sale.id,
    sale_number: sale.sale_number,
    completed_at: sale.completed_at,
    currency_code: sale.currency_code,
  }
}

/**
 * Process a return through complete_sale_v2.
 *
 * The RPC does the real work: it puts stock back through sale_reversal,
 * reverses the money, blocks over-returns, and attributes the refund to the
 * operator from the PIN token. The client sends only which units of which
 * original sale are coming back — never a refund amount, because the amount is
 * whatever was charged, which the server already knows.
 */
export function useProcessReturn() {
  const { business } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      parentSaleId: string
      shiftId?: string | null
      note?: string | null
      items: Array<{ variantId: string; quantity: string }>
      refunds: Array<{ method: string; amount: string }>
    }) => {
      const returnSaleId = crypto.randomUUID()
      const { data, error } = await supabase.rpc('complete_sale_v2', {
        p_sale_id: returnSaleId,
        p_business_id: business!.id,
        p_location_id: location!.id,
        p_items: input.items.map((i) => ({
          variant_id: i.variantId,
          quantity: i.quantity,
          movement_id: crypto.randomUUID(),
        })),
        p_payments: input.refunds,
        p_note: input.note ?? null,
        p_shift_id: input.shiftId ?? null,
        p_actor_token: readToken(),
        p_is_return: true,
        p_parent_sale_id: input.parentSaleId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['product-list'] })
      qc.invalidateQueries({ queryKey: ['low-stock'] })
      qc.invalidateQueries({ queryKey: ['pos', 'todays-sales'] })
      qc.invalidateQueries({ queryKey: ['returnable-sale', business?.id, input.parentSaleId] })
      qc.invalidateQueries({ queryKey: ['financial-position', business?.id] })
      qc.invalidateQueries({ queryKey: ['cashbook', business?.id] })
    },
  })
}

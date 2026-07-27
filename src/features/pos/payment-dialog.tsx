import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyInput } from '@/components/money/money-input'
import { Money } from '@/components/money/money'
import { formatMoneyForInput } from '@/lib/money'
import { SaleConfirmation } from '@/features/pos/sale-confirmation'
import type { PaymentMethod } from '@/types/database'
import type { Database } from '@/types/database'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Other' },
]

type CompletedSale = Database['public']['Tables']['sales']['Row']

export function PaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const { business } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const lines = useCartStore((s) => s.lines)
  const saleId = useCartStore((s) => s.saleId)
  const resetCart = useCartStore((s) => s.reset)
  const subtotal = cartSubtotal(lines)

  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  // Defaults the tendered amount to the total whenever the dialog (re)opens
  // for a fresh cart — cashier only has to type something different for cash
  // tendered above the total.
  useEffect(() => {
    if (open && !completedSale) {
      setAmount(business ? formatMoneyForInput(subtotal, business.currency_exponent) : subtotal.toFixed(2))
      setMethod('cash')
      setError(null)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [open])

  const tendered = amount.trim() === '' || Number.isNaN(Number(amount)) ? null : new Decimal(amount)
  const changeDue = method === 'cash' && tendered ? tendered.minus(subtotal) : null

  async function handleConfirm() {
    if (!business || !location) return
    setSubmitting(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('complete_sale', {
      p_sale_id: saleId,
      p_business_id: business.id,
      p_location_id: location.id,
      p_items: lines.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity.toString(),
        movement_id: l.movementId,
      })),
      p_payments: [{ method, amount: (tendered ?? new Decimal(0)).toString() }],
      p_note: note.trim() || null,
    })

    setSubmitting(false)

    if (rpcError || !data) {
      // Do not clear the cart — a retry must reuse the same saleId so a sale
      // that actually succeeded server-side returns idempotently instead of
      // duplicating (AC-S9.3, BR-S5.5).
      setError(toReadableError(rpcError))
      return
    }

    queryClient.invalidateQueries({ queryKey: ['product-list'] })
    queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    queryClient.invalidateQueries({ queryKey: ['movements'] })
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    setCompletedSale(data)
  }

  function handleNewSale() {
    resetCart()
    setCompletedSale(null)
    onOpenChange(false)
  }

  function handleDialogChange(next: boolean) {
    // Closing mid-flight (or after success without "New sale") must not lose
    // the cart or fabricate a fresh saleId while a sale might still be
    // in-flight; only the explicit New sale action resets.
    if (!next && submitting) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent>
        {completedSale ? (
          <SaleConfirmation
            sale={completedSale}
            paymentMethod={method}
            amountTendered={tendered ?? subtotal}
            onNewSale={handleNewSale}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Take payment</DialogTitle>
              <DialogDescription>
                Total: <Money value={subtotal} className="font-semibold text-text-primary" />
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-primary">Method</label>
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary">
                  {method === 'cash' ? 'Amount tendered' : 'Amount'}
                </label>
                <MoneyInput className="mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>

              {method === 'cash' && changeDue && (
                <div className="rounded-md border border-border bg-surface-muted/50 p-3 text-sm">
                  {changeDue.gte(0) ? (
                    <p>
                      Change due: <Money value={changeDue} className="font-semibold text-text-primary" />
                    </p>
                  ) : (
                    <p className="text-danger">
                      Short by <Money value={changeDue.abs()} />
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-text-primary">Note (optional)</label>
                <Textarea className="mt-1.5" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {error && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting || !tendered || lines.length === 0 || !location}
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Complete sale
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

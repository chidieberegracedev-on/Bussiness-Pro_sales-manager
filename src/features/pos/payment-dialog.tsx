import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { useOpenShift } from '@/features/finance/use-shifts'
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
import { cn } from '@/lib/utils'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Other' },
]

interface PaymentLine {
  key: string
  method: PaymentMethod
  amount: string
}

function newLine(method: PaymentMethod = 'cash', amount = ''): PaymentLine {
  return { key: crypto.randomUUID(), method, amount }
}

type CompletedSale = Database['public']['Tables']['sales']['Row']

export function PaymentDialog({
  open,
  onOpenChange,
  onCompleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Fires once the sale is committed. A restaurant order uses this to record
   * which sale settled it — an order is not revenue, the sale it produced is —
   * so the payment flow itself stays exactly the same in every vertical.
   */
  onCompleted?: (sale: CompletedSale) => void
}) {
  const queryClient = useQueryClient()
  const { business } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const { data: openShift } = useOpenShift(location?.id)
  const lines = useCartStore((s) => s.lines)
  const saleId = useCartStore((s) => s.saleId)
  const resetCart = useCartStore((s) => s.reset)
  const subtotal = cartSubtotal(lines)

  const [payments, setPayments] = useState<PaymentLine[]>([newLine('cash', '')])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  // Defaults a single cash line to the total whenever the dialog (re)opens
  // for a fresh cart — cashier only has to change it for split payments or
  // cash tendered above the total.
  useEffect(() => {
    if (open && !completedSale) {
      const defaultAmount = business
        ? formatMoneyForInput(subtotal, business.currency_exponent)
        : subtotal.toFixed(2)
      setPayments([newLine('cash', defaultAmount)])
      setError(null)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [open])

  const totalTendered = useMemo(
    () =>
      payments.reduce(
        (sum, p) => (p.amount.trim() === '' || Number.isNaN(Number(p.amount)) ? sum : sum.plus(p.amount)),
        new Decimal(0),
      ),
    [payments],
  )
  const cashTendered = useMemo(
    () =>
      payments
        .filter((p) => p.method === 'cash')
        .reduce(
          (sum, p) => (p.amount.trim() === '' || Number.isNaN(Number(p.amount)) ? sum : sum.plus(p.amount)),
          new Decimal(0),
        ),
    [payments],
  )
  const nonCashTendered = totalTendered.minus(cashTendered)
  // Change is only on the cash portion; the non-cash portion cannot generate change.
  const cashOwed = subtotal.minus(nonCashTendered)
  const changeDue = cashTendered.gt(0) && cashOwed.gte(0) ? cashTendered.minus(cashOwed) : null
  const shortBy = totalTendered.lt(subtotal) ? subtotal.minus(totalTendered) : null

  function updateLine(key: string, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }
  function removeLine(key: string) {
    setPayments((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev))
  }
  function addLine() {
    const remaining = subtotal.minus(totalTendered)
    const defaultAmount =
      remaining.gt(0) && business ? formatMoneyForInput(remaining, business.currency_exponent) : ''
    setPayments((prev) => [...prev, newLine('transfer', defaultAmount)])
  }

  async function handleConfirm() {
    if (!business || !location) return
    setSubmitting(true)
    setError(null)

    const paymentsPayload = payments
      .filter((p) => p.amount.trim() !== '' && Number(p.amount) > 0)
      .map((p) => ({ method: p.method, amount: new Decimal(p.amount).toString() }))

    const { data, error: rpcError } = await supabase.rpc('complete_sale', {
      p_sale_id: saleId,
      p_business_id: business.id,
      p_location_id: location.id,
      p_items: lines.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity.toString(),
        movement_id: l.movementId,
      })),
      p_payments: paymentsPayload,
      p_note: note.trim() || null,
      p_shift_id: openShift?.id ?? null,
    })

    setSubmitting(false)

    if (rpcError || !data) {
      console.error('[complete_sale] failed', { saleId, error: rpcError })
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
    queryClient.invalidateQueries({ queryKey: ['financial-position', business.id] })
    queryClient.invalidateQueries({ queryKey: ['cashbook', business.id] })
    setCompletedSale(data)
    onCompleted?.(data)
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
            paymentMethod={payments[0]?.method ?? 'cash'}
            amountTendered={totalTendered.gt(0) ? totalTendered : subtotal}
            onNewSale={handleNewSale}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Take payment</DialogTitle>
              <DialogDescription>
                Total: <Money value={subtotal} className="font-semibold text-text-primary" />
                {openShift && (
                  <span className="ml-2 text-xs text-text-muted">· cash sale attaches to open shift</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text-primary">Payments</label>
                  {payments.length < 4 && (
                    <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                      <Plus className="size-3.5" /> Add split
                    </Button>
                  )}
                </div>
                {payments.map((p) => (
                  <div key={p.key} className="flex gap-2">
                    <Select value={p.method} onValueChange={(v) => updateLine(p.key, { method: v as PaymentMethod })}>
                      <SelectTrigger className="w-32">
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
                    <div className="flex-1">
                      <MoneyInput
                        value={p.amount}
                        onChange={(e) => updateLine(p.key, { amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    {payments.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(p.key)}
                        aria-label="Remove payment"
                      >
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div
                className={cn(
                  'rounded-md border p-3 text-sm',
                  shortBy
                    ? 'border-danger/30 bg-danger/5'
                    : changeDue && changeDue.gt(0)
                      ? 'border-success/30 bg-success/5'
                      : 'border-border bg-surface-muted/50',
                )}
              >
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total tendered</span>
                  <Money value={totalTendered} className="font-semibold text-text-primary" />
                </div>
                {shortBy ? (
                  <div className="mt-1 flex justify-between text-danger">
                    <span>Short by</span>
                    <Money value={shortBy} className="font-semibold" />
                  </div>
                ) : changeDue && changeDue.gt(0) ? (
                  <div className="mt-1 flex justify-between">
                    <span className="text-text-secondary">Change due</span>
                    <Money value={changeDue} className="font-semibold text-success" />
                  </div>
                ) : null}
              </div>

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
                  disabled={submitting || !!shortBy || totalTendered.lte(0) || lines.length === 0 || !location}
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

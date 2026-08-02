import Decimal from 'decimal.js'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckCircle2, Printer, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { Separator } from '@/components/ui/separator'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useQueueReceipt } from '@/features/print/use-receipt'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatMoney } from '@/lib/money'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { Database, PaymentMethod } from '@/types/database'

type CompletedSale = Database['public']['Tables']['sales']['Row']

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  other: 'Other',
}

function useSaleItems(saleId: string) {
  return useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function SaleConfirmation({
  sale,
  paymentMethod,
  amountTendered,
  onNewSale,
}: {
  sale: CompletedSale
  paymentMethod: PaymentMethod
  amountTendered: Decimal
  onNewSale: () => void
}) {
  const { data: items } = useSaleItems(sale.id)
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const queueReceipt = useQueueReceipt()
  const [queueing, setQueueing] = useState(false)

  async function printReceipt() {
    if (!business || !items) return
    setQueueing(true)
    try {
      const money = (v: string | number) =>
        formatMoney(v, business.currency_code, business.currency_exponent, locale)
      await queueReceipt({
        saleId: sale.id,
        saleNumber: sale.sale_number,
        occurredAt: sale.created_at,
        lines: items.map((item) => ({
          name: item.variant_name
            ? `${item.product_name} · ${item.variant_name}`
            : item.product_name,
          qty: item.quantity,
          amount: money(item.line_total),
        })),
        subtotal: money(sale.subtotal ?? sale.grand_total),
        total: money(sale.grand_total),
        changeDue: changeDue && changeDue.gt(0) ? changeDue : null,
        fallbackMethod: paymentMethod,
      })
      toast({
        title: 'Receipt queued',
        description: 'Print it now from Settings › Printing, or hand the customer the QR.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't queue the receipt",
        description: toReadableError(error),
      })
    } finally {
      setQueueing(false)
    }
  }

  // Recomputed against the server's authoritative grand_total, not the
  // client's pre-submission cart subtotal — the price read at completion
  // may differ from what was shown while building the cart (BR-S1.4).
  const changeDue = paymentMethod === 'cash' ? amountTendered.minus(sale.grand_total) : null

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <DialogTitle>Sale #{sale.sale_number} complete</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {items && items.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">{item.product_name}</p>
                  {item.variant_name && <p className="text-xs text-text-muted">{item.variant_name}</p>}
                </div>
                <Quantity value={item.quantity} className="text-text-secondary" />
                <Money value={item.line_total} className="font-medium" />
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Total</span>
            <Money value={sale.grand_total} className="font-semibold text-text-primary" />
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Payment ({METHOD_LABELS[paymentMethod]})</span>
            <Money value={amountTendered} />
          </div>
          {changeDue !== null && (
            <div className="flex justify-between text-text-secondary">
              <span>Change due</span>
              <Money value={changeDue.gte(0) ? changeDue : 0} />
            </div>
          )}
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" size="lg" onClick={printReceipt} disabled={queueing}>
            {queueing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Receipt
          </Button>
          <Button className="flex-1" size="lg" onClick={onNewSale}>
            New sale
          </Button>
        </div>
      </div>
    </>
  )
}

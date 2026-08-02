import { useCallback } from 'react'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useEnqueuePrintJob, qrSvg, buildReceiptNumber } from '@/features/print/print-queue'
import { useActiveBusiness } from '@/features/business/hooks'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import type { ReceiptPayload } from '@/features/print/renderers'
import type { PaymentMethod } from '@/types/database'

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  other: 'Other',
}

/**
 * Builds and queues a receipt.
 *
 * Nothing here is computed — every figure already exists in a ledger. The
 * receipt's job is to SHOW the accountability the system recorded: which
 * operator (Phase 8/9), which till, which shift, and how the money actually
 * split across methods (Phase 7 sale_payments). A receipt that recalculated
 * anything would be a second source of truth.
 *
 * The QR encodes a verification URL keyed on the sale id, which is what a
 * customer scans to check the sale is real or to start a return.
 */
export function useQueueReceipt() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const context = useEmployeeSessionStore((s) => s.context)
  const enqueue = useEnqueuePrintJob()

  return useCallback(
    async (input: {
      saleId: string
      saleNumber: number | string
      occurredAt: string
      lines: { name: string; qty: string; amount: string }[]
      subtotal: string
      discount?: string | null
      total: string
      changeDue?: Decimal | null
      /** Falls back to a single-method receipt when split payments aren't loaded. */
      fallbackMethod?: PaymentMethod
      medium?: 'receipt-80mm' | 'receipt-58mm'
    }) => {
      if (!business) return

      // Split payments live in their own table — read them rather than
      // assuming the one method the till happened to start with.
      let payments: { method: string; amount: string }[] = []
      const { data } = await supabase
        .from('sale_payments')
        .select('method, amount')
        .eq('sale_id', input.saleId)
      const rows = (data ?? []) as { method: PaymentMethod; amount: string }[]
      if (rows.length > 0) {
        payments = rows.map((p) => ({
          method: METHOD_LABELS[p.method] ?? p.method,
          amount: formatMoney(p.amount, business.currency_code, business.currency_exponent, locale),
        }))
      } else if (input.fallbackMethod) {
        payments = [
          {
            method: METHOD_LABELS[input.fallbackMethod],
            amount: formatMoney(
              input.total,
              business.currency_code,
              business.currency_exponent,
              locale,
            ),
          },
        ]
      }

      const receiptNumber = buildReceiptNumber(input.saleId)
      const verifyUrl = `${window.location.origin}/sales/${input.saleId}`

      let qr: string | null = null
      try {
        qr = await qrSvg(verifyUrl)
      } catch {
        // A missing QR is a cosmetic loss; it must never block a receipt.
        qr = null
      }

      const payload: ReceiptPayload & { medium: string } = {
        businessName: business.name,
        receiptNumber: `${receiptNumber} · Sale #${input.saleNumber}`,
        occurredAt: formatDateTime(input.occurredAt, business.timezone, locale),
        operator: context?.display_name ?? null,
        terminal: context?.terminal_name ?? null,
        shiftRef: null,
        lines: input.lines,
        subtotal: input.subtotal,
        discount: input.discount ?? null,
        total: input.total,
        payments,
        changeDue:
          input.changeDue && input.changeDue.gt(0)
            ? formatMoney(
                input.changeDue.toString(),
                business.currency_code,
                business.currency_exponent,
                locale,
              )
            : null,
        verifyUrl,
        qrSvg: qr,
        footer: 'Thank you',
        medium: input.medium ?? 'receipt-80mm',
      }

      await enqueue.mutateAsync({
        jobType: 'receipt',
        payload: payload as unknown as Record<string, unknown>,
      })
      return receiptNumber
    },
    [business, locale, context, enqueue],
  )
}

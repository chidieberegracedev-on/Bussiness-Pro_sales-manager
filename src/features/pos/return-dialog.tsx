import { useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import { ArrowLeft, Loader2, Minus, Plus, RotateCcw, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useTodaysSales } from '@/features/pos/use-todays-sales'
import { useReturnableSale, useProcessReturn, type ReturnableLine } from '@/features/pos/use-returns'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useOpenShift } from '@/features/finance/use-shifts'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { PaymentMethod } from '@/types/database'
import { cn } from '@/lib/utils'

const REFUND_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

/**
 * The returns flow: find the original sale, choose how much of each line comes
 * back, refund it. The refund AMOUNT is never entered — it is whatever was
 * charged, which the server computes. The cashier only chooses quantities and
 * how the money goes back.
 */
export function ReturnDialog({
  open,
  onOpenChange,
  initialSaleId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSaleId?: string | null
}) {
  const [saleId, setSaleId] = useState<string | null>(initialSaleId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSaleId(initialSaleId)
      }}
    >
      <DialogContent className="max-w-lg">
        {saleId ? (
          <ReturnBuilder
            saleId={saleId}
            onBack={initialSaleId ? undefined : () => setSaleId(null)}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <SalePicker onPick={setSaleId} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SalePicker({ onPick }: { onPick: (saleId: string) => void }) {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: sales, isLoading } = useTodaysSales()
  const [search, setSearch] = useState('')

  const eligible = useMemo(
    () =>
      (sales ?? []).filter(
        (s) =>
          s.status === 'completed' &&
          !s.is_return &&
          (!search.trim() ||
            String(s.sale_number).includes(search.trim()) ||
            (s.sold_by_name ?? '').toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [sales, search],
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>Return an item</DialogTitle>
        <DialogDescription>Find the original sale to return against.</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Receipt number…"
          aria-label="Search sales"
          autoFocus
          className="pl-9"
        />
      </div>

      <div className="max-h-72 overflow-y-auto">
        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : eligible.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No sales to return"
            description="Only today's completed sales appear here. A refund reverses one of them."
          />
        ) : (
          <ul className="space-y-1">
            {eligible.map((sale) => (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => onPick(sale.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text-primary">
                      #{sale.sale_number}
                    </span>
                    <span className="type-meta block truncate">
                      {business ? formatDateTime(sale.completed_at, business.timezone, locale) : ''}
                      {sale.sold_by_name ? ` · ${sale.sold_by_name}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">
                    <Money value={sale.grand_total} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function ReturnBuilder({
  saleId,
  onBack,
  onDone,
}: {
  saleId: string
  onBack?: () => void
  onDone: () => void
}) {
  const { business } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const { data: openShift } = useOpenShift(location?.id)
  const locale = useLocale()
  const { data: sale, isLoading } = useReturnableSale(saleId)
  const processReturn = useProcessReturn()

  // variant_id → quantity chosen to return.
  const [qty, setQty] = useState<Record<string, Decimal>>({})
  const [method, setMethod] = useState<PaymentMethod>('cash')

  const refundTotal = useMemo(() => {
    if (!sale) return new Decimal(0)
    return sale.lines.reduce((sum, l) => {
      const q = qty[l.variant_id] ?? new Decimal(0)
      return sum.plus(q.times(new Decimal(l.unit_refund)))
    }, new Decimal(0))
  }, [sale, qty])

  const anyChosen = Object.values(qty).some((q) => q.gt(0))

  function setLineQty(line: ReturnableLine, next: Decimal) {
    const remaining = new Decimal(line.remaining)
    const clamped = Decimal.max(new Decimal(0), Decimal.min(next, remaining))
    setQty((prev) => ({ ...prev, [line.variant_id]: clamped }))
  }

  async function submit() {
    if (!sale || !anyChosen) return
    try {
      await processReturn.mutateAsync({
        parentSaleId: sale.id,
        shiftId: openShift?.id ?? null,
        items: sale.lines
          .filter((l) => (qty[l.variant_id] ?? new Decimal(0)).gt(0))
          .map((l) => ({ variantId: l.variant_id, quantity: qty[l.variant_id].toString() })),
        refunds: refundTotal.gt(0)
          ? [{ method, amount: refundTotal.toFixed(4) }]
          : [],
      })
      toast({ title: 'Return processed', description: 'Stock and the refund have been recorded.' })
      onDone()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't process the return",
        description: toReadableError(error),
      })
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to sales"
              className="rounded-md p-1 text-icon-muted hover:text-icon-strong"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          {sale ? `Return from #${sale.sale_number}` : 'Return'}
        </DialogTitle>
        {sale && (
          <DialogDescription>
            {business ? formatDateTime(sale.completed_at, business.timezone, locale) : ''}
          </DialogDescription>
        )}
      </DialogHeader>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : !sale || sale.lines.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title={sale?.fully_returned ? 'Already fully returned' : 'Nothing to return'}
          description={
            sale?.fully_returned
              ? 'Every item on this sale has already been returned.'
              : 'This sale has no returnable items.'
          }
        />
      ) : (
        <>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {sale.lines.map((line) => {
              const remaining = new Decimal(line.remaining)
              const chosen = qty[line.variant_id] ?? new Decimal(0)
              const exhausted = remaining.lte(0)
              return (
                <li
                  key={line.variant_id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl bg-background p-2.5',
                    exhausted && 'opacity-50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {line.product_name}
                    </p>
                    <p className="type-meta truncate">
                      {line.variant_name ? `${line.variant_name} · ` : ''}
                      <Money value={line.unit_refund} /> each ·{' '}
                      {exhausted
                        ? 'all returned'
                        : `${remaining.toString()} of ${line.sold_quantity} left`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-surface p-1">
                    <button
                      type="button"
                      aria-label={`One less ${line.product_name}`}
                      disabled={chosen.lte(0)}
                      onClick={() => setLineQty(line, chosen.minus(1))}
                      className="flex size-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-muted disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold tabular-nums text-text-primary">
                      {chosen.toString()}
                    </span>
                    <button
                      type="button"
                      aria-label={`One more ${line.product_name}`}
                      disabled={exhausted || chosen.gte(remaining)}
                      onClick={() => setLineQty(line, chosen.plus(1))}
                      className="flex size-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-muted disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="space-y-3 rounded-xl bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Refund by</span>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFUND_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[0.9375rem] font-semibold text-text-primary">Refund</span>
              <span className="text-xl font-bold tabular-nums text-text-primary">
                <Money value={refundTotal} />
              </span>
            </div>
          </div>

          <Button
            size="lg"
            className="h-12 w-full"
            disabled={!anyChosen || processReturn.isPending}
            onClick={submit}
          >
            {processReturn.isPending && <Loader2 className="size-4 animate-spin" />}
            Refund <Money value={refundTotal} />
          </Button>
        </>
      )}
    </>
  )
}

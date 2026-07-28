import { useState } from 'react'
import { Loader2, Wallet, Banknote, PiggyBank } from 'lucide-react'
import Decimal from 'decimal.js'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyInput } from '@/components/money/money-input'
import { useRecordExpense } from '@/features/finance/use-expenses'
import { useExpenseCategories } from '@/features/finance/use-expense-categories'
import { useDefaultLocation } from '@/features/business/hooks'
import { useOpenShift } from '@/features/finance/use-shifts'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { CashSource } from '@/types/database'
import { cn } from '@/lib/utils'

const SOURCES: { value: CashSource; label: string; icon: typeof Wallet }[] = [
  { value: 'cash', label: 'Cash', icon: Wallet },
  { value: 'bank', label: 'Bank', icon: Banknote },
  { value: 'petty_cash', label: 'Petty cash', icon: PiggyBank },
]

export function RecordExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: categories } = useExpenseCategories(false)
  const { data: location } = useDefaultLocation()
  const { data: openShift } = useOpenShift(location?.id)
  const record = useRecordExpense()

  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [paidFrom, setPaidFrom] = useState<CashSource>('cash')
  const [description, setDescription] = useState('')

  const canSubmit = Number(amount) > 0

  function reset() {
    setAmount('')
    setCategoryId('')
    setPaidFrom('cash')
    setDescription('')
  }

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await record.mutateAsync({
        amount: new Decimal(amount).toString(),
        paidFrom,
        categoryId: categoryId || null,
        description: description.trim() || null,
        locationId: location?.id ?? null,
        shiftId: paidFrom === 'cash' ? openShift?.id ?? null : null,
      })
      toast({ title: 'Expense recorded' })
      reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't record expense",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-primary">Amount</label>
            <MoneyInput
              className="mt-1.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary">Paid from</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setPaidFrom(s.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-all',
                    paidFrom === s.value
                      ? 'border-accent-primary bg-accent-primary/5 text-text-primary shadow-sm'
                      : 'border-border text-text-secondary hover:border-border-strong',
                  )}
                >
                  <s.icon className="size-5" />
                  {s.label}
                </button>
              ))}
            </div>
            {paidFrom === 'cash' && openShift && (
              <p className="mt-1 text-xs text-text-muted">Will attach to the open drawer shift.</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-text-muted">No categories yet</div>
                ) : (
                  (categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary">Description (optional)</label>
            <Textarea
              className="mt-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this for?"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || record.isPending}>
            {record.isPending && <Loader2 className="size-4 animate-spin" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

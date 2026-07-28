import { useState } from 'react'
import { ArrowRight, Loader2, Vault, PiggyBank, Wallet, Banknote } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/money/money-input'
import { useTransferCash } from '@/features/finance/use-shifts'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

type Account = 'cash' | 'bank' | 'safe' | 'petty_cash'

const ACCOUNT_LABELS: Record<Account, string> = {
  cash: 'Register',
  bank: 'Bank',
  safe: 'Safe',
  petty_cash: 'Petty cash',
}
const ACCOUNT_ICONS: Record<Account, typeof Wallet> = {
  cash: Wallet,
  bank: Banknote,
  safe: Vault,
  petty_cash: PiggyBank,
}

export function TransferCashDialog({
  initial,
  onClose,
}: {
  initial: { from: Account; to: Account; shiftId?: string }
  onClose: () => void
}) {
  const [from, setFrom] = useState<Account>(initial.from)
  const [to, setTo] = useState<Account>(initial.to)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const mutation = useTransferCash()

  const FromIcon = ACCOUNT_ICONS[from]
  const ToIcon = ACCOUNT_ICONS[to]

  async function submit() {
    if (!amount || Number(amount) <= 0 || from === to) return
    try {
      await mutation.mutateAsync({
        from,
        to,
        amount,
        shiftId: initial.shiftId ?? null,
        note: note.trim() || undefined,
      })
      toast({
        title: 'Cash moved',
        description: `${ACCOUNT_LABELS[from]} → ${ACCOUNT_LABELS[to]}`,
      })
      onClose()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't move cash",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move cash</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary">From</label>
              <div className="mt-1 space-y-1">
                {(['cash', 'bank', 'safe', 'petty_cash'] as Account[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setFrom(a)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-all',
                      from === a
                        ? 'border-accent-primary bg-accent-primary/5 text-text-primary'
                        : 'border-border text-text-secondary hover:border-border-strong',
                    )}
                  >
                    {(() => {
                      const I = ACCOUNT_ICONS[a]
                      return <I className="size-4" />
                    })()}
                    {ACCOUNT_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 pb-2">
              <FromIcon className="size-5 text-text-muted" />
              <ArrowRight className="size-5 text-accent-primary" />
              <ToIcon className="size-5 text-accent-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary">To</label>
              <div className="mt-1 space-y-1">
                {(['cash', 'bank', 'safe', 'petty_cash'] as Account[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setTo(a)}
                    disabled={a === from}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-all',
                      to === a
                        ? 'border-accent-primary bg-accent-primary/5 text-text-primary'
                        : 'border-border text-text-secondary hover:border-border-strong',
                      a === from && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    {(() => {
                      const I = ACCOUNT_ICONS[a]
                      return <I className="size-4" />
                    })()}
                    {ACCOUNT_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
            <label className="text-sm font-medium text-text-primary">Note (optional)</label>
            <Input
              className="mt-1.5"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for the move"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!amount || Number(amount) <= 0 || from === to || mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import Decimal from 'decimal.js'
import {
  Clock,
  Loader2,
  Wallet,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MoneyInput } from '@/components/money/money-input'
import { Money } from '@/components/money/money'
import { Term } from '@/features/help/term'
import {
  useOpenShiftMutation,
  useCloseShiftMutation,
  type CashShift,
} from '@/features/finance/use-shifts'
import { useDefaultLocation } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * Opening a shift from the till itself.
 *
 * The cashier can never reach /shifts/open: WorkspaceGate renders the Registry
 * for a cashier whatever the route says, so a page-based flow is unreachable
 * for the one role that needs it most. This is the same mutation, in a dialog
 * that opens where they already are.
 */
export function OpenShiftDialog({ onClose }: { onClose: () => void }) {
  const { data: location } = useDefaultLocation()
  const openShift = useOpenShiftMutation()
  const [float, setFloat] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!location) {
      setError('No default location for this business.')
      return
    }
    setError(null)
    try {
      await openShift.mutateAsync({ locationId: location.id, openingFloat: float || '0' })
      toast({
        title: 'Shift open',
        description: 'Cash sales will attach to this drawer automatically.',
      })
      onClose()
    } catch (e) {
      setError(toReadableError(e))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5" /> Open shift
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Count the cash already in the drawer and enter it below. Everything you take today is
            measured against this number, so a guess here becomes a variance at close.
          </p>

          <div>
            <label className="text-sm font-medium text-text-primary">
              Opening <Term slug="float">float</Term>
            </label>
            <MoneyInput
              className="mt-1.5"
              value={float}
              onChange={(e) => setFloat(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !openShift.isPending) submit()
              }}
            />
            <p className="mt-1 text-xs text-text-muted">
              Enter 0 if the drawer starts empty.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={openShift.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={openShift.isPending}>
              {openShift.isPending && <Loader2 className="size-4 animate-spin" />}
              Open shift
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The blind close.
 *
 * The expected figure is never shown before the count is submitted — that is
 * the entire point of the control (BR-C3). close_shift computes expected
 * server-side and returns the variance, so what the cashier sees after
 * submitting is a result, not a target they could have typed toward.
 *
 * Handover reopens a fresh shift with the counted cash as its float, so the
 * drawer is continuous across a change of person without anyone recounting.
 */
export function CloseShiftDialog({
  shift,
  onClose,
  onHandover,
}: {
  shift: CashShift
  onClose: () => void
  onHandover?: () => void
}) {
  const closeShift = useCloseShiftMutation()
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CashShift | null>(null)

  async function submit() {
    if (!counted.trim()) return
    setError(null)
    try {
      const closed = await closeShift.mutateAsync({
        shiftId: shift.id,
        countedCash: counted,
        note: note.trim() || undefined,
      })
      setResult(closed)
    } catch (e) {
      setError(toReadableError(e))
    }
  }

  const variance = result?.variance ? new Decimal(result.variance) : null
  const balanced = variance?.isZero() ?? false
  const short = variance?.isNegative() ?? false

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result ? (
              <>
                {balanced ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <AlertTriangle className="size-5 text-warning" />
                )}
                Shift closed
              </>
            ) : (
              <>
                <EyeOff className="size-5" /> Count the drawer
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/5 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-info" />
              <p className="text-sm text-text-secondary">
                Count the cash in the drawer and enter the total. You'll see what was expected only
                after you submit — that's what makes the count meaningful.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-text-primary">Counted cash</label>
              <MoneyInput
                className="mt-1.5"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && counted.trim() && !closeShift.isPending) submit()
                }}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-primary">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything that explains the drawer"
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={closeShift.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!counted.trim() || closeShift.isPending}>
                {closeShift.isPending && <Loader2 className="size-4 animate-spin" />}
                Submit count
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-lg border border-border bg-surface-muted/50 p-3 text-sm">
              <Row label="You counted" value={<Money value={result.counted_cash ?? '0'} />} />
              <Row label="Expected" value={<Money value={result.expected_cash ?? '0'} />} />
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                <span className="font-medium text-text-primary">Variance</span>
                <span
                  className={`font-semibold tabular-nums ${
                    balanced ? 'text-success' : short ? 'text-danger' : 'text-warning'
                  }`}
                >
                  <Money value={result.variance ?? '0'} />
                </span>
              </div>
            </div>

            <p className="text-sm text-text-secondary">
              {balanced
                ? 'The drawer balanced exactly. Nothing further is needed.'
                : short
                  ? "The drawer is short. It's recorded for a manager to review — this is a note, not an accusation."
                  : 'The drawer is over. Recorded for a manager to review.'}
            </p>

            <div className="flex flex-col gap-2">
              {onHandover && (
                <Button
                  onClick={() => {
                    onHandover()
                    onClose()
                  }}
                >
                  <ArrowRight className="size-4" /> Hand over to next operator
                </Button>
              )}
              <Button variant={onHandover ? 'outline' : 'default'} onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-text-secondary">
        <Wallet className="size-3.5 text-text-muted" />
        {label}
      </span>
      <span className="tabular-nums text-text-primary">{value}</span>
    </div>
  )
}

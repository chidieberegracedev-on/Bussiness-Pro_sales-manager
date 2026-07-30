import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ArrowRight,
  Vault,
  PiggyBank,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MoneyInput } from '@/components/money/money-input'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/data/error-state'
import { useShift, useCloseShiftMutation } from '@/features/finance/use-shifts'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { TransferCashDialog } from '@/features/finance/transfer-cash-dialog'
import { Term } from '@/features/help/term'
import type { CashShift } from '@/features/finance/use-shifts'

type Mode = 'live' | 'counting' | 'closed'

export function CloseShiftPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { business } = useActiveBusiness()
  const locale = useLocale()

  const { data: shift, isLoading, isError, refetch } = useShift(id)
  const closeMutation = useCloseShiftMutation()

  const [countedCash, setCountedCash] = useState('')
  const [note, setNote] = useState('')
  const [closeError, setCloseError] = useState<string | null>(null)
  const [transferOpen, setTransferOpen] = useState<null | { from: 'cash' | 'safe' | 'petty_cash'; to: 'cash' | 'safe' | 'petty_cash' }>(null)

  const mode: Mode = useMemo(() => {
    if (!shift) return 'live'
    if (shift.status === 'closed') return 'closed'
    return 'live'
  }, [shift])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  if (isError || !shift) {
    return <ErrorState error={new Error('Shift not found')} onRetry={() => refetch()} />
  }

  async function submitCount() {
    if (!shift || !countedCash) return
    setCloseError(null)
    try {
      const closed = await closeMutation.mutateAsync({
        shiftId: shift.id,
        countedCash,
        note: note.trim() || undefined,
      })
      const variance = closed.variance ? new Decimal(closed.variance) : new Decimal(0)
      toast({
        title: 'Shift closed',
        description: variance.eq(0) ? 'Count matched expected.' : `Variance: ${variance.toString()}`,
      })
    } catch (error) {
      const message = toReadableError(error)
      setCloseError(message)
      toast({
        variant: 'destructive',
        title: "Couldn't close shift",
        description: message,
      })
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/shifts')}>
        <ArrowLeft className="size-4" /> Shifts
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              {mode === 'closed' ? (
                <>
                  <CheckCircle2 className="size-5 text-success" />
                  Shift closed
                </>
              ) : (
                <>Close shift · blind count</>
              )}
            </CardTitle>
            <span className="text-xs text-text-muted">
              Opened{' '}
              {business ? formatDateTime(shift.opened_at, business.timezone, locale) : shift.opened_at}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetaItem
              label={<Term slug="float">Opening float</Term>}
              value={<Money value={shift.opening_float} />}
            />
            {mode === 'closed' && (
              <>
                <MetaItem label="Counted" value={<Money value={shift.counted_cash ?? '0'} />} />
                <MetaItem label="Expected" value={<Money value={shift.expected_cash ?? '0'} />} />
              </>
            )}
          </div>

          {mode === 'live' && (
            <>
              <BlindCountForm
                onSubmit={submitCount}
                countedCash={countedCash}
                onCountChange={setCountedCash}
                note={note}
                onNoteChange={setNote}
                submitting={closeMutation.isPending}
              />
              {closeError && (
                <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {closeError}
                </p>
              )}
            </>
          )}

              {mode === 'closed' && (
            <>
              <ClosedShiftResult shift={shift} />
              {/* Handover: the counted cash becomes the next operator's float,
                  so accountability separates cleanly at the changeover
                  (BR-C3.6). */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">Handing over to someone?</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    Their opening float starts at the{' '}
                    <Money value={shift.counted_cash ?? '0'} /> you just counted.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(`/shifts/open?float=${encodeURIComponent(shift.counted_cash ?? '0')}`)
                  }
                >
                  Start next shift <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {mode === 'live' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">During the shift</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setTransferOpen({ from: 'cash', to: 'safe' })}
            >
              <Vault className="size-5" />
              <span className="text-sm">
                <Term slug="safe-drop">Drop to safe</Term>
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setTransferOpen({ from: 'cash', to: 'petty_cash' })}
            >
              <PiggyBank className="size-5" />
              <span className="text-sm">Fund petty cash</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {transferOpen && (
        <TransferCashDialog
          initial={{ ...transferOpen, shiftId: shift.id }}
          onClose={() => setTransferOpen(null)}
        />
      )}
    </div>
  )
}

function MetaItem({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/40 p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function BlindCountForm({
  onSubmit,
  countedCash,
  onCountChange,
  note,
  onNoteChange,
  submitting,
}: {
  onSubmit: () => void
  countedCash: string
  onCountChange: (v: string) => void
  note: string
  onNoteChange: (v: string) => void
  submitting: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm text-text-secondary">
        <p className="flex items-center gap-2 font-medium text-text-primary">
          <EyeOff className="size-4" />
          Count the drawer first — expected is hidden
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Enter what you physically counted. Submit to reveal expected and any variance. This is the point of a blind
          close — a preview would defeat it.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-text-primary">Counted cash in drawer</label>
        <MoneyInput
          className="mt-1.5"
          value={countedCash}
          onChange={(e) => onCountChange(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </div>

      <div>
        <label className="text-sm font-medium text-text-primary">Note (optional)</label>
        <input
          className="mt-1.5 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Anything unusual?"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={!countedCash || Number(countedCash) < 0 || submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          <Eye className="size-4" /> Submit count &amp; reveal
        </Button>
      </div>
    </div>
  )
}

function ClosedShiftResult({ shift }: { shift: CashShift }) {
  const variance = shift.variance ? new Decimal(shift.variance) : new Decimal(0)
  const state = variance.eq(0) ? 'match' : variance.gt(0) ? 'over' : 'short'

  return (
    <div>
      <div
        className={`rounded-lg border p-4 ${
          state === 'match'
            ? 'border-success/30 bg-success/5'
            : state === 'over'
              ? 'border-success/30 bg-success/5'
              : 'border-danger/30 bg-danger/5'
        }`}
      >
        <div className="flex items-center gap-3">
          {state === 'match' ? (
            <CheckCircle2 className="size-6 text-success" />
          ) : (
            <AlertTriangle className={`size-6 ${state === 'over' ? 'text-success' : 'text-danger'}`} />
          )}
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {state === 'match' && 'Counted exactly matches expected'}
              {state === 'over' && (
                <>
                  Over by <Money value={variance} />
                </>
              )}
              {state === 'short' && (
                <>
                  Short by <Money value={variance.abs()} />
                </>
              )}
            </p>
            <p className="text-xs text-text-muted">
              Variance recorded as an event; cash balance now matches physical count.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
          <Money value={shift.counted_cash ?? '0'} className="font-semibold text-text-primary" />
          <span>counted</span>
          <ArrowRight className="size-3 text-text-muted" />
          <Money value={shift.expected_cash ?? '0'} className="font-semibold text-text-primary" />
          <span>expected</span>
        </div>
      </div>
      {shift.note && (
        <p className="mt-3 text-sm text-text-secondary">
          <span className="text-text-muted">Note:</span> {shift.note}
        </p>
      )}
    </div>
  )
}

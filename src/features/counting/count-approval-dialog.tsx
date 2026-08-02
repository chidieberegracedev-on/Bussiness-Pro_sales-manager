import { useState } from 'react'
import type Decimal from 'decimal.js'
import { ShieldCheck, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { PinPad } from '@/features/control/pin-pad'
import { useApprovers } from '@/features/control/use-authorization'
import { useApproveCountSession, type CountSession } from '@/features/counting/use-count-session'
import { ROLE_LABELS } from '@/features/control/roles'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

interface Summary {
  countedLines: number
  uncounted: number
  overLines: number
  shortLines: number
  shrinkage: Decimal
  gain: Decimal
  net: Decimal
}

const REASON_MESSAGE: Record<string, string> = {
  bad_pin: 'That PIN is not correct.',
  locked_out: 'That operator is locked out after too many wrong PINs. Try again later.',
  not_authorized: 'Only a manager or owner can approve a count.',
  cancelled: 'This count was cancelled and can no longer be approved.',
}

/**
 * Manager-PIN approval — the moment a count stops being a worksheet and starts
 * moving inventory and money.
 *
 * The numbers are shown BEFORE the PIN, including blind sessions: the whole
 * point of blind counting is that the counter didn't see the expected figure,
 * not that the approver signs blind. The approver is accepting a write-off, so
 * they get to see exactly what they're accepting.
 */
export function CountApprovalDialog({
  session,
  summary,
  onClose,
  onApproved,
}: {
  session: CountSession
  summary: Summary
  onClose: () => void
  onApproved?: () => void
}) {
  const { data: approvers, isLoading } = useApprovers()
  const approve = useApproveCountSession()

  const [selected, setSelected] = useState<{ member_id: string; display_name: string; role: string } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  function submitPin(pin: string) {
    if (!selected) return
    setError(null)
    approve.mutate(
      { sessionId: session.id, approverMemberId: selected.member_id, approverPin: pin },
      {
        onSuccess: (result) => {
          // A wrong PIN comes back as a RESULT, not an error — see 0023. The
          // denial has to commit so it lands in the audit trail.
          if (!result.approved) {
            setError(REASON_MESSAGE[result.reason ?? ''] ?? 'Approval was refused.')
            return
          }
          toast({
            title: 'Count approved',
            description:
              result.adjustments && result.adjustments > 0
                ? `${result.adjustments} adjustment${result.adjustments === 1 ? '' : 's'} posted.`
                : 'No differences to post.',
          })
          onApproved?.()
          onClose()
        },
        onError: (e) => setError(toReadableError(e)),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Manager approval
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5 rounded-lg border border-border bg-surface-muted/50 p-3 text-sm">
            <Row label="Lines counted" value={String(summary.countedLines)} />
            {summary.uncounted > 0 && (
              <Row label="Not counted" value={String(summary.uncounted)} muted />
            )}
            <Row label="Short" value={String(summary.shortLines)} />
            <Row label="Over" value={String(summary.overLines)} />
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
              <span className="font-medium text-text-primary">
                {summary.net.isNegative() ? 'Shrinkage write-off' : 'Net gain'}
              </span>
              <span
                className={`font-semibold tabular-nums ${summary.net.isNegative() ? 'text-danger' : 'text-success'}`}
              >
                <Money value={summary.net.abs()} />
              </span>
            </div>
          </div>

          {summary.uncounted > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-sm text-text-secondary">
                {summary.uncounted} line{summary.uncounted === 1 ? '' : 's'} weren't counted. They
                are left untouched — approving does not zero them.
              </p>
            </div>
          )}

          <p className="text-sm text-text-secondary">
            Approving posts each difference as a stock adjustment and writes off any net shortage as
            an expense. This cannot be undone.
          </p>

          {!selected ? (
            <div>
              <p className="mb-2 text-sm font-medium text-text-secondary">Who is approving?</p>
              {isLoading && <Skeleton className="h-24 w-full rounded-lg" />}
              {!isLoading && (approvers ?? []).length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                  No manager or owner has a PIN set up, so this can't be approved here. Set one on
                  the Operators screen.
                </p>
              )}
              <ul className="space-y-2">
                {(approvers ?? []).map((approver) => (
                  <li key={approver.member_id}>
                    <button
                      type="button"
                      onClick={() => setSelected(approver)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-muted"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-accent-primary/10 text-sm font-semibold text-accent-primary">
                        {approver.display_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {approver.display_name}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {ROLE_LABELS[approver.role]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="mb-3 text-center text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{selected.display_name}</span> — enter
                your PIN to approve
              </p>
              <div className="flex justify-center">
                <PinPad
                  onSubmit={submitPin}
                  submitting={approve.isPending}
                  error={error}
                  onClearError={() => setError(null)}
                />
              </div>
              {approve.isPending && (
                <p className="mt-3 flex items-center justify-center gap-2 text-sm text-text-muted">
                  <Loader2 className="size-3.5 animate-spin" /> Posting adjustments
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 w-full"
                disabled={approve.isPending}
                onClick={() => {
                  setSelected(null)
                  setError(null)
                }}
              >
                <ArrowLeft className="size-4" /> Choose someone else
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-text-muted' : 'text-text-secondary'}>{label}</span>
      <span className="tabular-nums text-text-primary">{value}</span>
    </div>
  )
}

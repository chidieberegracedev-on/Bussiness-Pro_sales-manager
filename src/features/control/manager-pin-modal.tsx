import { useState } from 'react'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { PinPad } from '@/features/control/pin-pad'
import { useApprovers, useAuthorize, type PendingAuthorization } from '@/features/control/use-authorization'
import { ACTION_LABELS, ROLE_LABELS } from '@/features/control/roles'
import { toReadableError } from '@/lib/errors'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Sits over whatever the cashier was doing — it never navigates, so the basket
 * survives an approval (BR-C4.4). A grant here records authorized_by = the
 * approver while initiated_by stays the cashier.
 */
export function ManagerPinModal({
  pending,
  onResolve,
}: {
  pending: PendingAuthorization
  onResolve: (grant: Parameters<PendingAuthorization['resolve']>[0]) => void
}) {
  const { data: approvers, isLoading } = useApprovers()
  const authorize = useAuthorize()
  const [selected, setSelected] = useState<{ member_id: string; display_name: string; role: string } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  function submit(pin: string) {
    if (!selected) return
    setError(null)
    authorize.mutate(
      {
        action: pending.action,
        context: pending.context,
        approverMemberId: selected.member_id,
        approverPin: pin,
      },
      {
        onSuccess: (grant) => {
          if (grant.granted) onResolve(grant)
          else setError('That approval was not accepted.')
        },
        onError: (e) => setError(toReadableError(e)),
      },
    )
  }

  const ctx = pending.context

  return (
    <Dialog open onOpenChange={(open) => !open && onResolve(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-warning" />
            Approval needed
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm">
          <p className="font-medium text-text-primary">{ACTION_LABELS[pending.action]}</p>
          <p className="mt-0.5 text-text-secondary">
            {ctx?.amount != null && (
              <>
                Amount <Money value={String(ctx.amount)} />
              </>
            )}
            {ctx?.percent != null && <>{String(ctx.percent)}% discount</>}
            {ctx?.quantity != null && <>{String(ctx.quantity)} units</>}
            {ctx?.amount == null && ctx?.percent == null && ctx?.quantity == null && (
              <>This is above your limit.</>
            )}
          </p>
          <p className="mt-1.5 text-xs text-text-muted">
            A manager or owner must approve. The sale stays yours — their approval is recorded
            separately.
          </p>
        </div>

        {selected ? (
          <div>
            <div className="mb-4 text-center">
              <p className="text-sm font-semibold text-text-primary">{selected.display_name}</p>
              <p className="text-xs text-text-muted">Enter approver PIN</p>
            </div>
            <div className="flex justify-center">
              <PinPad
                onSubmit={submit}
                submitting={authorize.isPending}
                error={error}
                onClearError={() => setError(null)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 w-full"
              onClick={() => {
                setSelected(null)
                setError(null)
              }}
            >
              <ArrowLeft className="size-4" /> Choose someone else
            </Button>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-text-secondary">Who is approving?</p>
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            )}
            {!isLoading && (approvers ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                No manager or owner has a PIN set up, so this can't be approved at the terminal. Ask
                an owner to set one on the Operators screen.
              </p>
            )}
            {!isLoading && (approvers ?? []).length > 0 && (
              <ul className="space-y-2">
                {(approvers ?? []).map((approver) => (
                  <li key={approver.member_id}>
                    <button
                      type="button"
                      onClick={() => setSelected(approver)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-surface-muted"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/10 text-xs font-semibold text-warning">
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
            )}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={() => onResolve(null)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  )
}

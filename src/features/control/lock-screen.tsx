import { useMemo, useState } from 'react'
import { ArrowLeft, Lock, MonitorSmartphone, ShieldAlert, UserRound } from 'lucide-react'
import {
  useTerminalEmployees,
  usePinUnlock,
  useResumeSession,
  type EmployeeOption,
} from '@/features/control/use-session'
import { useEmployeeSessionStore, getTerminalId } from '@/features/control/session-store'
import { PinPad } from '@/features/control/pin-pad'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveBusiness } from '@/features/business/hooks'
import { toReadableError } from '@/lib/errors'
import { ROLE_LABELS } from '@/features/control/roles'
import { cn } from '@/lib/utils'

/**
 * The full-screen PIN gate. Two modes:
 *  - resume: a locked session exists — the same operator re-enters their PIN and
 *    the session (and their basket) continues.
 *  - unlock: pick an employee, then enter their PIN to mint a new session.
 */
export function LockScreen() {
  const { business } = useActiveBusiness()
  const context = useEmployeeSessionStore((s) => s.context)
  const clear = useEmployeeSessionStore((s) => s.clear)
  const isLocked = context?.status === 'locked'

  const { data: employees, isLoading } = useTerminalEmployees()
  const unlock = usePinUnlock()
  const resume = useResumeSession()

  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const terminalId = getTerminalId()

  const withPin = useMemo(() => (employees ?? []).filter((e) => e.has_pin), [employees])

  function handleUnlock(pin: string) {
    setError(null)
    if (isLocked) {
      resume.mutate(pin, { onError: (e) => setError(toReadableError(e)) })
      return
    }
    if (!selected) return
    unlock.mutate(
      { memberId: selected.member_id, pin },
      { onError: (e) => setError(toReadableError(e)) },
    )
  }

  const submitting = unlock.isPending || resume.isPending

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background-subtle p-6">
      <div className="w-full max-w-md">
        {/* Branding + terminal identity */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
            <Lock className="size-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {business?.name ?? 'Business Pro'}
          </h1>
          {(context?.terminal_name || terminalId) && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-text-muted">
              <MonitorSmartphone className="size-3.5" />
              {context?.terminal_name ?? 'This terminal'}
            </p>
          )}
        </div>

        {!terminalId && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-text-primary">This device isn't registered</p>
              <p className="mt-0.5 text-text-secondary">
                An owner or manager needs to register it as a terminal in Settings before employees
                can sign in here.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {isLocked ? (
            <>
              <div className="mb-5 text-center">
                <p className="text-sm text-text-secondary">Screen locked</p>
                <p className="mt-0.5 text-lg font-semibold text-text-primary">
                  {context?.display_name ?? 'Operator'}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Enter your PIN to continue — your basket is still here.
                </p>
              </div>
              <div className="flex justify-center">
                <PinPad
                  onSubmit={handleUnlock}
                  submitting={submitting}
                  error={error}
                  onClearError={() => setError(null)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-5 w-full"
                onClick={() => {
                  clear()
                  setSelected(null)
                  setError(null)
                }}
              >
                Sign in as someone else
              </Button>
            </>
          ) : selected ? (
            <>
              <div className="mb-5 text-center">
                <p className="text-lg font-semibold text-text-primary">{selected.display_name}</p>
                <p className="mt-0.5 text-xs text-text-muted">{ROLE_LABELS[selected.role]}</p>
              </div>
              <div className="flex justify-center">
                <PinPad
                  onSubmit={handleUnlock}
                  submitting={submitting}
                  error={error}
                  onClearError={() => setError(null)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-5 w-full"
                onClick={() => {
                  setSelected(null)
                  setError(null)
                }}
              >
                <ArrowLeft className="size-4" /> Choose a different name
              </Button>
            </>
          ) : (
            <>
              <p className="mb-4 text-center text-sm text-text-secondary">
                Select your name to sign in
              </p>
              {isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              )}
              {!isLoading && withPin.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <UserRound className="mx-auto size-8 text-text-muted" />
                  <p className="mt-2 text-sm font-medium text-text-primary">No PINs set up yet</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    An owner or manager can set employee PINs in Settings › Employees.
                  </p>
                </div>
              )}
              {!isLoading && withPin.length > 0 && (
                <ul className="space-y-2">
                  {withPin.map((employee) => (
                    <li key={employee.member_id}>
                      <button
                        type="button"
                        onClick={() => setSelected(employee)}
                        disabled={!terminalId}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors',
                          terminalId ? 'hover:bg-surface-muted' : 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-sm font-semibold text-accent-primary">
                          {employee.display_name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {employee.display_name}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {ROLE_LABELS[employee.role]}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Crown,
  ShieldCheck,
  Package,
  ShoppingCart,
  MonitorSmartphone,
  ArrowLeft,
  KeyRound,
  Lock,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PinPad } from '@/features/control/pin-pad'
import {
  useTerminalEmployees,
  usePinUnlock,
  useResumeSession,
  type EmployeeOption,
} from '@/features/control/use-session'
import { useEmployeeSessionStore, getTerminalId } from '@/features/control/session-store'
import { useActiveBusiness } from '@/features/business/hooks'
import { ROLE_LABELS } from '@/features/control/roles'
import { toReadableError } from '@/lib/errors'
import type { MemberRole } from '@/types/database'
import { cn } from '@/lib/utils'

const ROLE_ICONS: Record<MemberRole, typeof Crown> = {
  owner: Crown,
  manager: ShieldCheck,
  inventory_staff: Package,
  cashier: ShoppingCart,
}

const ROLE_TINTS: Record<MemberRole, string> = {
  owner: 'bg-warning/10 text-warning',
  manager: 'bg-accent-secondary/10 text-accent-secondary',
  inventory_staff: 'bg-info/10 text-info',
  cashier: 'bg-accent-primary/10 text-accent-primary',
}

/**
 * The Operator Selection Screen.
 *
 * One central Supabase login authenticates the BUSINESS. This screen
 * authenticates the PERSON: every active member of that business is listed, and
 * whoever is at the terminal picks their name and enters their own 4-digit PIN.
 * The role that `pin_unlock` returns decides which workspace loads.
 *
 * Employees are operator records inside the business — they never have their own
 * email or password, and never touch the owner's.
 */
export function OperatorSelectionScreen({ onOwnerAdmin }: { onOwnerAdmin?: () => void } = {}) {
  const { business } = useActiveBusiness()
  const context = useEmployeeSessionStore((s) => s.context)
  const clear = useEmployeeSessionStore((s) => s.clear)
  const isLocked = context?.status === 'locked'

  const { data: members, isLoading } = useTerminalEmployees()
  const unlock = usePinUnlock()
  const resume = useResumeSession()

  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const terminalId = getTerminalId()

  // Owners first, then managers, then everyone else — the list reads like the
  // shop's hierarchy rather than an arbitrary order.
  const ordered = useMemo(() => {
    const rank: Record<MemberRole, number> = {
      owner: 0,
      manager: 1,
      inventory_staff: 2,
      cashier: 3,
    }
    return [...(members ?? [])].sort(
      (a, b) => rank[a.role] - rank[b.role] || a.display_name.localeCompare(b.display_name),
    )
  }, [members])

  const anyPins = ordered.some((m) => m.has_pin)

  function submitPin(pin: string) {
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
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {business?.name ?? 'Business Pro'}
          </h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-text-muted">
            <MonitorSmartphone className="size-3.5" />
            {context?.terminal_name ?? (terminalId ? 'This terminal' : 'Device not registered')}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          {isLocked ? (
            /* A locked session resumes as the same operator, basket intact. */
            <>
              <div className="mb-5 text-center">
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-surface-muted text-text-muted">
                  <Lock className="size-5" />
                </div>
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
                  onSubmit={submitPin}
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
                Switch operator
              </Button>
            </>
          ) : selected ? (
            /* Chosen a name — now the PIN. */
            <>
              <div className="mb-5 text-center">
                <OperatorAvatar name={selected.display_name} role={selected.role} size="lg" />
                <p className="mt-2 text-lg font-semibold text-text-primary">
                  {selected.display_name}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">{ROLE_LABELS[selected.role]}</p>
              </div>
              <div className="flex justify-center">
                <PinPad
                  onSubmit={submitPin}
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
                <ArrowLeft className="size-4" /> Back to operators
              </Button>
            </>
          ) : (
            /* The operator list. */
            <>
              <p className="mb-4 text-center text-sm font-medium text-text-secondary">
                Select operator
              </p>

              {isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!isLoading && ordered.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <UserRound className="mx-auto size-8 text-text-muted" />
                  <p className="mt-2 text-sm font-medium text-text-primary">No operators yet</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Add people to this business from the Employees screen.
                  </p>
                </div>
              )}

              {!isLoading && ordered.length > 0 && (
                <ul className="space-y-2">
                  {ordered.map((member) => {
                    const locked =
                      !!member.locked_until && new Date(member.locked_until) > new Date()
                    const selectable = member.has_pin && !!terminalId && !locked
                    return (
                      <li key={member.member_id}>
                        <button
                          type="button"
                          onClick={() => selectable && setSelected(member)}
                          disabled={!selectable}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors',
                            selectable ? 'hover:bg-surface-muted' : 'cursor-not-allowed opacity-55',
                          )}
                        >
                          <OperatorAvatar name={member.display_name} role={member.role} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text-primary">
                              {member.display_name}
                            </span>
                            <span className="block text-xs text-text-muted">
                              {ROLE_LABELS[member.role]}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-text-muted">
                            {locked ? (
                              <span className="font-medium text-danger">Locked</span>
                            ) : member.has_pin ? (
                              <span className="inline-flex items-center gap-1">
                                <KeyRound className="size-3" /> PIN required
                              </span>
                            ) : (
                              'No PIN set'
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!terminalId && !isLoading && (
                <p className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-text-secondary">
                  This device isn't registered as a terminal yet, so operators can't sign in here.
                </p>
              )}

              {/* Everyone is listed, but nobody can get in — say who can fix it
                  rather than leaving a dead screen. */}
              {!isLoading && ordered.length > 0 && !anyPins && (
                <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-sm text-text-secondary">
                  Nobody has a PIN yet. An owner signed in with the business email can set PINs from
                  the Operators screen.
                </p>
              )}

              {/* The way out for the person who owns the login. This device is a
                  till, but the account holder is still the account holder —
                  they administer without a PIN, from any device. */}
              {onOwnerAdmin && (
                <Button variant="outline" className="mt-4 w-full" onClick={onOwnerAdmin}>
                  <ShieldCheck className="size-4" /> Continue as owner (admin)
                </Button>
              )}
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-text-muted">
          Operators sign in with a PIN only — never an email or password.
          {!isLocked && !selected && !onOwnerAdmin && (
            <>
              {' '}
              <Link to="/employees" className="text-accent-primary hover:underline">
                Manage operators
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function OperatorAvatar({
  name,
  role,
  size = 'md',
}: {
  name: string
  role: MemberRole
  size?: 'md' | 'lg'
}) {
  const Icon = ROLE_ICONS[role]
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-semibold',
        ROLE_TINTS[role],
        size === 'lg' ? 'mx-auto size-14 text-lg' : 'size-10 text-sm',
      )}
    >
      {name.slice(0, 1).toUpperCase()}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-card',
          size === 'lg' ? 'size-6' : 'size-5',
        )}
      >
        <Icon className={size === 'lg' ? 'size-3.5' : 'size-3'} />
      </span>
    </span>
  )
}

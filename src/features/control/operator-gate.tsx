import { create } from 'zustand'
import { ShieldCheck, Users, ArrowRight, MonitorSmartphone, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTerminalEmployees } from '@/features/control/use-session'
import { getTerminalId } from '@/features/control/session-store'
import { useActiveBusiness } from '@/features/business/hooks'
import { ROLE_LABELS } from '@/features/control/roles'

const ADMIN_CHOICE_KEY = 'bp-continue-as-admin'

interface OperatorChoiceState {
  /** True once the account holder has chosen to work as themselves this session. */
  continueAsAdmin: boolean
  setContinueAsAdmin: (value: boolean) => void
}

export const useOperatorChoiceStore = create<OperatorChoiceState>((set) => ({
  continueAsAdmin: sessionStorage.getItem(ADMIN_CHOICE_KEY) === 'true',
  setContinueAsAdmin: (value) => {
    if (value) sessionStorage.setItem(ADMIN_CHOICE_KEY, 'true')
    else sessionStorage.removeItem(ADMIN_CHOICE_KEY)
    set({ continueAsAdmin: value })
  },
}))

/**
 * Shown once after the account holder signs in, when the business has employees
 * who can sign in with a PIN.
 *
 * The point is that the owner is an administrator, not the default cashier: they
 * pick explicitly whether they are working as themselves or handing the terminal
 * to an operator. The choice is remembered for the tab so it doesn't nag.
 */
export function OperatorChoiceScreen({ onSwitchOperator }: { onSwitchOperator: () => void }) {
  const { business, role } = useActiveBusiness()
  const { data: employees, isLoading } = useTerminalEmployees()
  const setContinueAsAdmin = useOperatorChoiceStore((s) => s.setContinueAsAdmin)
  const terminalId = getTerminalId()

  const withPin = (employees ?? []).filter((e) => e.has_pin)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background-subtle p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {business?.name ?? 'Business Pro'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">Who's working this terminal?</p>
        </div>

        <div className="space-y-3">
          {/* The account holder continuing as themselves. */}
          <button
            type="button"
            onClick={() => setContinueAsAdmin(true)}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-text-primary">
                Continue as {role ? ROLE_LABELS[role] : 'account holder'}
              </span>
              <span className="mt-0.5 block text-sm text-text-secondary">
                Full management access — reports, purchasing, finance, and setup.
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-text-muted" />
          </button>

          {/* Handing the terminal to an employee. */}
          <button
            type="button"
            onClick={onSwitchOperator}
            disabled={isLoading || withPin.length === 0 || !terminalId}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-secondary/10 text-accent-secondary">
              <Users className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-text-primary">Switch operator</span>
              <span className="mt-0.5 block text-sm text-text-secondary">
                {isLoading ? (
                  <Skeleton className="h-4 w-40" />
                ) : !terminalId ? (
                  'Register this device as a terminal first.'
                ) : withPin.length === 0 ? (
                  'No employee has a PIN yet.'
                ) : (
                  `Sign in with a PIN — ${withPin.length} ${withPin.length === 1 ? 'person' : 'people'} set up.`
                )}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-text-muted" />
          </button>
        </div>

        {/* Setup shortcuts when the prerequisites are missing. */}
        {(!terminalId || withPin.length === 0) && !isLoading && (
          <div className="mt-5 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm font-medium text-text-primary">Before employees can sign in</p>
            <div className="mt-2.5 space-y-2">
              {!terminalId && (
                <SetupLink
                  to="/settings/terminals"
                  icon={MonitorSmartphone}
                  label="Register this device as a terminal"
                  onNavigate={() => setContinueAsAdmin(true)}
                />
              )}
              {withPin.length === 0 && (
                <SetupLink
                  to="/employees"
                  icon={Users}
                  label="Give your team members a PIN"
                  onNavigate={() => setContinueAsAdmin(true)}
                />
              )}
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-text-muted">
          <Settings2 className="mr-1 inline size-3" />
          Employees never use the business email and password — only their own PIN.
        </p>
      </div>
    </div>
  )
}

function SetupLink({
  to,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string
  icon: typeof Users
  label: string
  onNavigate: () => void
}) {
  return (
    <Button asChild variant="outline" size="sm" className="w-full justify-start">
      <Link to={to} onClick={onNavigate}>
        <Icon className="size-3.5" />
        {label}
      </Link>
    </Button>
  )
}

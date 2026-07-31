import { create } from 'zustand'
import { Navigate, Outlet } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useRestoreSession, useAutoLock, useTerminalEmployees } from '@/features/control/use-session'
import { OperatorSelectionScreen } from '@/features/control/operator-selection'
import { OwnerPinSetupScreen } from '@/features/control/owner-pin-setup'
import { RegistryWorkspace } from '@/features/control/registry-workspace'
import { FullPageLoading } from '@/components/layout/full-page-loading'
import { PermissionDeniedState } from '@/components/data/error-state'
import { useActiveBusiness } from '@/features/business/hooks'
import type { MemberRole } from '@/types/database'

const BOOTSTRAP_KEY = 'bp-setup-bootstrap'

const PIN_SET_KEY = 'bp-pin-established'

interface BootstrapState {
  /**
   * Set only when no operator has a PIN yet, so the account holder can reach
   * Employees and create the first PINs. Cleared as soon as PINs exist.
   */
  bootstrapping: boolean
  setBootstrapping: (value: boolean) => void
  /**
   * Latched the moment we successfully set a PIN. The gate trusts this over the
   * operator query: if that query is broken or unreadable, a false "no PINs
   * exist" would otherwise loop the owner back onto the setup screen forever.
   */
  pinEstablished: boolean
  markPinEstablished: () => void
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  bootstrapping: sessionStorage.getItem(BOOTSTRAP_KEY) === 'true',
  setBootstrapping: (value) => {
    if (value) sessionStorage.setItem(BOOTSTRAP_KEY, 'true')
    else sessionStorage.removeItem(BOOTSTRAP_KEY)
    set({ bootstrapping: value })
  },
  pinEstablished: sessionStorage.getItem(PIN_SET_KEY) === 'true',
  markPinEstablished: () => {
    sessionStorage.setItem(PIN_SET_KEY, 'true')
    set({ pinEstablished: true, bootstrapping: false })
  },
}))

/**
 * Decides which workspace loads.
 *
 * The Supabase session authenticates the BUSINESS. It does not, by itself,
 * grant a workspace — the operator does. So every route below this gate needs a
 * PIN session, and the role that `pin_unlock` returned decides what renders.
 *
 * The one exception is bootstrap: a business whose operators have no PINs yet
 * would otherwise be locked out of the screen where PINs are set.
 */
export function WorkspaceGate() {
  useRestoreSession()

  const token = useEmployeeSessionStore((s) => s.token)
  const context = useEmployeeSessionStore((s) => s.context)
  const restored = useEmployeeSessionStore((s) => s.restored)
  const bootstrapping = useBootstrapStore((s) => s.bootstrapping)
  const setBootstrapping = useBootstrapStore((s) => s.setBootstrapping)

  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
    refetch,
  } = useTerminalEmployees()
  const { role: deviceRole } = useActiveBusiness()
  const pinEstablished = useBootstrapStore((s) => s.pinEstablished)
  const markPinEstablished = useBootstrapStore((s) => s.markPinEstablished)

  useAutoLock(!!context && context.status === 'active')

  // A stored token still resolving — don't flash the operator screen.
  if (token && !context && !restored) return <FullPageLoading />

  // An operator has passed the PIN gate: their role decides the workspace.
  if (context?.status === 'active') {
    if (context.role === 'cashier') return <RegistryWorkspace />
    return <Outlet />
  }

  // A locked session resumes as the same operator.
  if (context?.status === 'locked') return <OperatorSelectionScreen />

  if (membersLoading) return <FullPageLoading />

  // The operator query failed. Never silently fall through to the setup screen —
  // that reads as "no PINs exist" and loops the operator with no way out.
  if (membersError) {
    return (
      <GateError
        onRetry={() => refetch()}
        canBypass={deviceRole === 'owner' || deviceRole === 'manager'}
        onBypass={() => setBootstrapping(true)}
      />
    )
  }

  // pinEstablished is latched locally the moment a PIN is saved, so a stale or
  // wrong `has_pin` can never trap the owner on the setup screen again.
  const anyPins = pinEstablished || (members ?? []).some((m) => m.has_pin)

  // Fresh business: nobody has a PIN, so the gate would be unpassable. Let the
  // account holder set theirs first — this is the only way past without a PIN.
  if (!anyPins) {
    if (deviceRole === 'owner' || deviceRole === 'manager') {
      return (
        <OwnerPinSetupScreen
          onDone={() => {
            markPinEstablished()
            refetch()
          }}
        />
      )
    }
    // No PINs and no authority to create one — nothing useful to show.
    return <OperatorSelectionScreen />
  }

  // PINs exist, so bootstrap is over for good: everyone signs in as an operator,
  // the owner included.
  if (bootstrapping) setBootstrapping(false)

  return <OperatorSelectionScreen />
}

function GateError({
  onRetry,
  canBypass,
  onBypass,
}: {
  onRetry: () => void
  canBypass: boolean
  onBypass: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-subtle p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertCircle className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-text-primary">Couldn't load operators</h1>
        <p className="mt-1 text-sm text-text-secondary">
          The sign-in list didn't load, so we can't show who can work this terminal.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={onRetry}>Try again</Button>
          {canBypass && (
            <Button variant="outline" onClick={onBypass}>
              Continue to setup
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Guard for management surfaces. The operator's role is authoritative; the
 * device account's role only applies during bootstrap, when no operator session
 * exists yet. Hiding is UX — 0012's RLS and RPC checks are the real boundary.
 */
export function RequireManagementAccess({ roles }: { roles?: MemberRole[] }) {
  const context = useEmployeeSessionStore((s) => s.context)
  const bootstrapping = useBootstrapStore((s) => s.bootstrapping)
  const { role: deviceRole, isLoading } = useActiveBusiness()

  const effectiveRole = context?.status === 'active' ? context.role : bootstrapping ? deviceRole : undefined

  if (isLoading && !effectiveRole) return <FullPageLoading />
  if (effectiveRole === 'cashier') return <Navigate to="/registry" replace />
  if (roles && effectiveRole && !roles.includes(effectiveRole)) {
    return <PermissionDeniedState requiredRole={roles[0]} />
  }
  return <Outlet />
}

/** Standalone Registry route, so a cashier always has somewhere real to land. */
export function RegistryRoute() {
  useRestoreSession()
  const context = useEmployeeSessionStore((s) => s.context)
  const token = useEmployeeSessionStore((s) => s.token)
  const restored = useEmployeeSessionStore((s) => s.restored)

  useAutoLock(!!context && context.status === 'active')

  if (token && !context && !restored) return <FullPageLoading />
  if (!context || context.status !== 'active') return <OperatorSelectionScreen />
  return <RegistryWorkspace />
}

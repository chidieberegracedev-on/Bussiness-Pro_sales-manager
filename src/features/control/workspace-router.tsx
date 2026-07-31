import { create } from 'zustand'
import { Navigate, Outlet } from 'react-router-dom'
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

interface BootstrapState {
  /**
   * Set only when no operator has a PIN yet, so the account holder can reach
   * Employees and create the first PINs. Cleared as soon as PINs exist.
   */
  bootstrapping: boolean
  setBootstrapping: (value: boolean) => void
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  bootstrapping: sessionStorage.getItem(BOOTSTRAP_KEY) === 'true',
  setBootstrapping: (value) => {
    if (value) sessionStorage.setItem(BOOTSTRAP_KEY, 'true')
    else sessionStorage.removeItem(BOOTSTRAP_KEY)
    set({ bootstrapping: value })
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

  const { data: members, isLoading: membersLoading, refetch } = useTerminalEmployees()
  const { role: deviceRole } = useActiveBusiness()

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

  const anyPins = (members ?? []).some((m) => m.has_pin)

  // Fresh business: nobody has a PIN, so the gate would be unpassable. Let the
  // account holder set theirs first — this is the only way past without a PIN.
  if (!anyPins) {
    if (deviceRole === 'owner' || deviceRole === 'manager') {
      return (
        <OwnerPinSetupScreen
          onDone={() => {
            setBootstrapping(false)
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

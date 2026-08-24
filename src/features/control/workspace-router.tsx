import { create } from 'zustand'
import { Navigate, Outlet } from 'react-router-dom'
import { useEmployeeSessionStore, getTerminalId } from '@/features/control/session-store'
import { useRestoreSession, useAutoLock } from '@/features/control/use-session'
import { OperatorSelectionScreen } from '@/features/control/operator-selection'
import { PosWorkspace } from '@/features/pos/pos-workspace'
import { FullPageLoading } from '@/components/layout/full-page-loading'
import { PermissionDeniedState } from '@/components/data/error-state'
import { useActiveBusiness } from '@/features/business/hooks'
import type { MemberRole } from '@/types/database'

const OWNER_ADMIN_KEY = 'bp-owner-admin'

interface WorkspaceModeState {
  /**
   * The account holder chose to administer this device rather than sign in as
   * an operator on it.
   *
   * Only reachable in multi-operator mode, and only on a device that has been
   * bound to a terminal — it is the way back out of the operator screen for the
   * person who owns the Supabase login. Without it, registering the till you
   * are sitting at would lock you out of your own admin.
   */
  ownerAdmin: boolean
  setOwnerAdmin: (value: boolean) => void
}

export const useWorkspaceModeStore = create<WorkspaceModeState>((set) => ({
  ownerAdmin: sessionStorage.getItem(OWNER_ADMIN_KEY) === 'true',
  setOwnerAdmin: (value) => {
    if (value) sessionStorage.setItem(OWNER_ADMIN_KEY, 'true')
    else sessionStorage.removeItem(OWNER_ADMIN_KEY)
    set({ ownerAdmin: value })
  },
}))

/**
 * Decides which workspace loads.
 *
 * Everything here is downstream of ONE flag: businesses.operator_mode (0018).
 *
 *   single_owner  — the default every business starts in. There are no
 *     employees, so there is nobody to tell apart: the Supabase login is the
 *     whole identity story. No PIN, no operator selection, no terminal
 *     restriction, no shift enforcement. A first-time visitor sees the product.
 *
 *   multi_operator — the owner has added staff. Now a till has to know who is
 *     standing at it, so registered terminals show the operator screen and the
 *     role that pin_unlock returns decides what renders.
 *
 * The distinction that matters inside multi-operator mode is TERMINAL, not
 * role: every device signs into the same business account, so "is this a till?"
 * is the only thing that separates the shop floor from the back office. An
 * unbound device is the owner's own, and goes straight to admin.
 */
export function WorkspaceGate() {
  useRestoreSession()

  const token = useEmployeeSessionStore((s) => s.token)
  const context = useEmployeeSessionStore((s) => s.context)
  const restored = useEmployeeSessionStore((s) => s.restored)
  const ownerAdmin = useWorkspaceModeStore((s) => s.ownerAdmin)
  const setOwnerAdmin = useWorkspaceModeStore((s) => s.setOwnerAdmin)
  const { isMultiOperator, role: deviceRole } = useActiveBusiness()

  useAutoLock(isMultiOperator && !!context && context.status === 'active')

  // Single-owner mode: the operator layer does not exist. Nothing below this
  // line runs, so no PIN screen can appear before there is anyone to identify.
  if (!isMultiOperator) return <Outlet />

  // A stored token still resolving — don't flash the operator screen.
  if (token && !context && !restored) return <FullPageLoading />

  // An operator has passed the PIN gate: their role decides the workspace.
  if (context?.status === 'active') {
    if (context.role === 'cashier') return <PosWorkspace />
    return <Outlet />
  }

  // A locked session resumes as the same operator.
  if (context?.status === 'locked') return <OperatorSelectionScreen />

  // The account holder always reaches admin. An unregistered device is by
  // definition not a till, so "device not registered" is never a blocker here —
  // it is the normal state of the owner's own laptop or phone.
  const isTerminal = !!getTerminalId()
  const isAccountHolder = deviceRole === 'owner' || deviceRole === 'manager'
  if (!isTerminal) return <Outlet />
  if (ownerAdmin && isAccountHolder) return <Outlet />

  return (
    <OperatorSelectionScreen
      onOwnerAdmin={isAccountHolder ? () => setOwnerAdmin(true) : undefined}
    />
  )
}

/**
 * Guard for management surfaces. When an operator session exists its role is
 * authoritative; otherwise the Supabase account's own role governs — that is
 * every request in single-owner mode, and owner administration in multi-operator
 * mode. Hiding is UX — 0012's RLS and RPC checks are the real boundary.
 */
export function RequireManagementAccess({ roles }: { roles?: MemberRole[] }) {
  const context = useEmployeeSessionStore((s) => s.context)
  const { role: deviceRole, isLoading } = useActiveBusiness()

  const effectiveRole = context?.status === 'active' ? context.role : deviceRole

  if (isLoading && !effectiveRole) return <FullPageLoading />
  if (effectiveRole === 'cashier') return <Navigate to="/registry" replace />
  if (roles && effectiveRole && !roles.includes(effectiveRole)) {
    return <PermissionDeniedState requiredRole={roles[0]} />
  }
  return <Outlet />
}

/**
 * Standalone till route, so a cashier always has somewhere real to land.
 * In single-owner mode there are no cashiers, so it is simply the owner's own
 * till view — no PIN in front of it.
 *
 * This renders the POS WORKSPACE: its own shell, its own navigation, its own
 * top-bar tools. A cashier never sees the management sidebar, filtered or
 * otherwise — "the admin console with things hidden" is the feeling this
 * whole route exists to avoid.
 */
export function RegistryRoute() {
  useRestoreSession()
  const context = useEmployeeSessionStore((s) => s.context)
  const token = useEmployeeSessionStore((s) => s.token)
  const restored = useEmployeeSessionStore((s) => s.restored)
  const { isMultiOperator } = useActiveBusiness()

  useAutoLock(isMultiOperator && !!context && context.status === 'active')

  if (!isMultiOperator) return <PosWorkspace />
  if (token && !context && !restored) return <FullPageLoading />
  if (!context || context.status !== 'active') return <OperatorSelectionScreen />
  return <PosWorkspace />
}

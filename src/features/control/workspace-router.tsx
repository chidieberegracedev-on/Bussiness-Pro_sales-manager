import { Navigate, Outlet } from 'react-router-dom'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useRestoreSession, useAutoLock } from '@/features/control/use-session'
import { LockScreen } from '@/features/control/lock-screen'
import { RegistryWorkspace } from '@/features/control/registry-workspace'
import { FullPageLoading } from '@/components/layout/full-page-loading'
import { PermissionDeniedState } from '@/components/data/error-state'
import { useActiveBusiness } from '@/features/business/hooks'
import type { MemberRole } from '@/types/database'

/**
 * Decides which workspace a request lands in.
 *
 * A PIN session, when present, is authoritative: a cashier session gets the
 * Registry and nothing else. With no PIN session the device account's own role
 * governs, which is how an owner keeps working without a PIN.
 *
 * This is UX routing only. The server rejects out-of-role actions regardless of
 * what renders here (BR-C2.6 / BR-C6.3).
 */
export function WorkspaceGate() {
  useRestoreSession()

  const token = useEmployeeSessionStore((s) => s.token)
  const context = useEmployeeSessionStore((s) => s.context)
  const restored = useEmployeeSessionStore((s) => s.restored)

  // Auto-lock only matters while a PIN session is actually active.
  useAutoLock(!!context && context.status === 'active')

  // A stored token still resolving — don't flash the lock screen.
  if (token && !context && !restored) return <FullPageLoading />

  if (context?.status === 'locked') return <LockScreen />

  if (context?.status === 'active' && context.role === 'cashier') {
    return <RegistryWorkspace />
  }

  // Manager, owner, or inventory staff (with or without a PIN session) continue
  // into the management shell.
  return <Outlet />
}

/**
 * Route guard for the management app. Cashiers who reach a management URL — by
 * typing it or by a stale link — are sent to their workspace rather than shown
 * a half-broken screen.
 */
export function RequireManagementAccess({ roles }: { roles?: MemberRole[] }) {
  const context = useEmployeeSessionStore((s) => s.context)
  const { role: deviceRole, isLoading } = useActiveBusiness()

  // The PIN actor wins when one is present.
  const effectiveRole = context?.status === 'active' ? context.role : deviceRole

  if (isLoading && !effectiveRole) return <FullPageLoading />
  if (effectiveRole === 'cashier') return <Navigate to="/registry" replace />
  if (roles && effectiveRole && !roles.includes(effectiveRole)) {
    return <PermissionDeniedState requiredRole={roles[0]} />
  }
  return <Outlet />
}

/** Standalone route so a cashier can be sent somewhere real. */
export function RegistryRoute() {
  useRestoreSession()
  const context = useEmployeeSessionStore((s) => s.context)
  const token = useEmployeeSessionStore((s) => s.token)
  const restored = useEmployeeSessionStore((s) => s.restored)

  useAutoLock(!!context && context.status === 'active')

  if (token && !context && !restored) return <FullPageLoading />
  if (!context || context.status !== 'active') return <LockScreen />
  return <RegistryWorkspace />
}

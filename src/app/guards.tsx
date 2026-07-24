import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store'
import { useActiveBusiness } from '@/features/business/hooks'
import { FullPageLoading } from '@/components/layout/full-page-loading'
import { PermissionDeniedState } from '@/components/data/error-state'
import type { MemberRole } from '@/types/database'

// Guard order: authenticated -> has business -> has role. Each failure has
// its own destination, never a shared redirect (WEB_IMPLEMENTATION.md §6).

export function RequireAuth() {
  const session = useAuthStore((s) => s.session)
  const initializing = useAuthStore((s) => s.initializing)

  if (initializing) return <FullPageLoading />
  if (!session) return <Navigate to="/sign-in" replace />
  return <Outlet />
}

export function RequireGuest() {
  const session = useAuthStore((s) => s.session)
  const initializing = useAuthStore((s) => s.initializing)

  if (initializing) return <FullPageLoading />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireBusiness() {
  const { memberships, membership, isLoading } = useActiveBusiness()

  if (isLoading) return <FullPageLoading />
  if (!memberships || memberships.length === 0) return <Navigate to="/onboarding" replace />
  if (!membership) return <Navigate to="/select-business" replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: MemberRole[] }) {
  const { role, isLoading } = useActiveBusiness()

  if (isLoading) return <FullPageLoading />
  if (role && !roles.includes(role)) return <PermissionDeniedState requiredRole={roles[0]} />
  return <Outlet />
}

import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, LayoutDashboard, Receipt, UserRound } from 'lucide-react'
import {
  WorkspaceShell,
  WorkspaceTopBar,
  type WorkspaceNavGroup,
} from '@/components/workspace/workspace-shell'
import { Button } from '@/components/ui/button'
import { useActiveBusiness } from '@/features/business/hooks'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { ROLE_LABELS } from '@/features/control/roles'
import { MyWorkTodayPage } from '@/features/employee/my-work-today'
import { MyShiftsPage } from '@/features/employee/my-shifts'
import { MySalesPage } from '@/features/employee/my-sales'
import { MyProfilePage } from '@/features/employee/my-profile'

const NAV: WorkspaceNavGroup[] = [
  {
    items: [
      { label: 'Today', to: '/me', icon: LayoutDashboard, end: true },
      { label: 'My shifts', to: '/me/shifts', icon: Clock },
      { label: 'My sales', to: '/me/sales', icon: Receipt },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'My profile', to: '/me/profile', icon: UserRound }],
  },
]

/**
 * The operator's personal workspace.
 *
 * A read surface over data that already exists — cash_shifts.opened_by,
 * sales.sold_by, activity_events — because the accountability chain
 * (employee → shift → terminal → transactions → cash) is already recorded and
 * duplicating any of it would create a second version of the truth.
 *
 * Deliberately shows this person's OWN work only. Comparison against other
 * employees is a management question and lives in the management shell; a
 * cashier seeing a leaderboard on their own screen is a different product with
 * different consequences.
 */
export function EmployeeWorkspace() {
  const navigate = useNavigate()
  const { business, membership, role: deviceRole } = useActiveBusiness()
  const context = useEmployeeSessionStore((s) => s.context)

  const name = context?.display_name ?? membership?.display_name ?? 'My work'
  const role = context?.status === 'active' ? context.role : deviceRole
  const canLeave = deviceRole === 'owner' || deviceRole === 'manager'

  return (
    <WorkspaceShell
      id="employee"
      brand={
        <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-primary text-sm font-bold text-primary-foreground">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-bold text-text-primary">
              My work
            </span>
          </span>
        </>
      }
      context={
        <div className="rounded-2xl bg-background p-3">
          <p className="truncate text-sm font-bold text-text-primary">{name}</p>
          <p className="type-meta mt-0.5 truncate">
            {[role ? ROLE_LABELS[role] : null, business?.name].filter(Boolean).join(' · ')}
          </p>
        </div>
      }
      groups={NAV}
      footer={
        canLeave ? (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="size-4" /> Back to management
          </Button>
        ) : undefined
      }
      topBar={<WorkspaceTopBar title={name} subtitle={role ? ROLE_LABELS[role] : undefined} />}
    >
      <div className="h-full overflow-y-auto p-4 sm:p-6">
        <Outlet />
      </div>
    </WorkspaceShell>
  )
}

/** The workspace's own nested routes, so `/me/*` is one self-contained shell. */
export function EmployeeWorkspaceRoutes() {
  return (
    <Routes>
      <Route element={<EmployeeWorkspace />}>
        <Route index element={<MyWorkTodayPage />} />
        <Route path="shifts" element={<MyShiftsPage />} />
        <Route path="sales" element={<MySalesPage />} />
        <Route path="profile" element={<MyProfilePage />} />
        <Route path="*" element={<Navigate to="/me" replace />} />
      </Route>
    </Routes>
  )
}

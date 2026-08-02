import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { useActiveBusiness } from '@/features/business/hooks'
import type { MemberRole } from '@/types/database'

const ALL_ROLES: MemberRole[] = ['owner', 'manager', 'inventory_staff', 'cashier']

const TABS: { to: string; label: string; roles: MemberRole[] }[] = [
  { to: '/settings/business', label: 'Business', roles: ['owner', 'manager'] },
  { to: '/settings/categories', label: 'Categories', roles: ['owner', 'manager'] },
  { to: '/settings/terminals', label: 'Terminals', roles: ['owner', 'manager'] },
  { to: '/settings/printing', label: 'Printing & scanning', roles: ['owner', 'manager'] },
  { to: '/settings/permissions', label: 'Permissions', roles: ['owner', 'manager'] },
  { to: '/settings/appearance', label: 'Appearance', roles: ALL_ROLES },
]

export function SettingsLayout() {
  const { role } = useActiveBusiness()
  const tabs = TABS.filter((t) => !role || t.roles.includes(role))

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6" aria-label="Settings sections">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center border-b-2 px-1 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-6 max-w-2xl">
        <Outlet />
      </div>
    </div>
  )
}

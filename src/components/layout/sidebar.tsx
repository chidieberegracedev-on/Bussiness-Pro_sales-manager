import { NavLink, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/components/layout/nav-config'
import { useSidebarStore } from '@/components/layout/sidebar-store'
import { BusinessSwitcher } from '@/components/layout/business-switcher'
import { UserMenu } from '@/components/layout/user-menu'
import { useActiveBusiness } from '@/features/business/hooks'
import { Button } from '@/components/ui/button'

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { role } = useActiveBusiness()
  const location = useLocation()

  const items = NAV_ITEMS.map((item) => {
    if (item.label === 'Settings' && role === 'cashier') {
      return { ...item, to: '/settings/appearance' }
    }
    return item
  })

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      {!collapsed && (
        <div className="px-1">
          <BusinessSwitcher />
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Primary">
        {items.map((item) => {
          const visibleChildren = item.children?.filter((c) => !c.roles || (role && c.roles.includes(role)))
          const activeParent = item.children?.some((c) => location.pathname.startsWith(c.to))

          return (
            <div key={item.label}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive || activeParent
                      ? 'bg-surface-muted text-text-primary'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                    collapsed && 'justify-center px-0',
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
              {!collapsed && visibleChildren && visibleChildren.length > 0 && (
                <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                  {visibleChildren.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-9 items-center rounded-md px-2 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'text-text-primary font-medium'
                            : 'text-text-secondary hover:text-text-primary',
                        )
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-border pt-3">{!collapsed && <UserMenu />}</div>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)

  return (
    <>
      {/* Desktop: persistent, collapsible to icons */}
      <aside
        className={cn(
          'relative hidden shrink-0 border-r border-border bg-surface transition-all duration-200 lg:block',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <SidebarContent collapsed={collapsed} />
        <Button
          variant="outline"
          size="icon"
          onClick={toggleCollapsed}
          className="absolute -right-4 top-4 hidden size-8 rounded-full bg-surface lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </aside>

      {/* Mobile: drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-72 bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="text-sm font-semibold">Menu</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <X className="size-4" />
              </Button>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}

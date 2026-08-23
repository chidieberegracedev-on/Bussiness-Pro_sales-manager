import { NavLink, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from '@/components/layout/nav-config'
import { useSidebarStore, SIDEBAR_MIN_WIDTH } from '@/components/layout/sidebar-store'
import { SidebarResizer } from '@/components/layout/sidebar-resizer'
import { BusinessSwitcher } from '@/components/layout/business-switcher'
import { UserMenu } from '@/components/layout/user-menu'
import { useActiveBusiness } from '@/features/business/hooks'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A nav row. Collapsed, it is an icon with a tooltip carrying the label — an
 * icon rail with no tooltips asks people to memorise glyphs.
 */
function NavRow({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  onNavigate?: () => void
}) {
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      // Collapsed, the only content is an aria-hidden icon, so without this
      // the link has no accessible name — a screen reader reads nine
      // consecutive "link"s. The tooltip is a visual affordance and does not
      // substitute for one.
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group/nav flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
          // Selected state is where the accent belongs: a tinted pill and a
          // near-black label. Everything else is a dark neutral, so the eye can
          // find "where am I" without reading.
          isActive || active
            ? collapsed
              // A pale tint on a 40px square reads as nothing. In the rail the
              // selected item is the ONLY thing that can tell you where you
              // are, so it goes solid.
              ? 'bg-accent-primary text-primary-foreground'
              : 'bg-tint-accent font-semibold text-tint-accent-foreground'
            : 'font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary',
          collapsed && 'mx-auto size-10 justify-center px-0',
        )
      }
    >
      {/* Render-prop children, so the ICON can also see isActive. Computing it
          outside meant a directly-selected row kept a neutral icon while its
          label turned accent. */}
      {({ isActive }) => (
        <>
          <item.icon
            className={cn(
              'size-[1.125rem] shrink-0 transition-colors',
              // An icon does NOT inherit the accent by default. It picks it up
              // only when its row is selected.
              isActive || active
                ? 'text-current'
                : 'text-icon group-hover/nav:text-text-primary',
            )}
            aria-hidden="true"
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { role: deviceRole } = useActiveBusiness()
  const sessionContext = useEmployeeSessionStore((s) => s.context)
  const location = useLocation()

  // A PIN-unlocked operator's role governs what they see; without one the device
  // account's role applies. Hiding is UX only — the server enforces the boundary.
  const role = sessionContext?.status === 'active' ? sessionContext.role : deviceRole

  const sections = NAV_SECTIONS.filter(
    (section) =>
      location.pathname.startsWith(section.activeWhenPathStartsWith) &&
      (!section.roles || (role && section.roles.includes(role))),
  )

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role))).map(
    (item) => {
      if (item.label === 'Settings' && role !== 'owner' && role !== 'manager') {
        return { ...item, to: '/settings/appearance' }
      }
      return item
    },
  )

  return (
    <div className="flex h-full flex-col gap-3 p-2.5">
      {!collapsed && (
        <div className="px-0.5">
          <BusinessSwitcher />
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Primary">
        {items.map((item) => {
          const visibleChildren = item.children?.filter(
            (c) => !c.roles || (role && c.roles.includes(role)),
          )
          const activeParent = !!item.children?.some((c) => location.pathname.startsWith(c.to))

          // The workspace section belongs to a global item, so it renders
          // directly beneath it. Appending it after the whole nav list left it
          // below nine other groups — present, but only if you scrolled.
          const section = sections.find((s) => s.activeWhenPathStartsWith === item.to)

          return (
            <div key={item.label} className={cn(!collapsed && visibleChildren?.length && 'pb-1')}>
              <NavRow
                item={item}
                collapsed={collapsed}
                active={activeParent}
                onNavigate={onNavigate}
              />

              {/* No section title here: the parent row directly above already
                  says "Supplier Network", and repeating it as an eyebrow put
                  the same words on screen twice. The indent and rule group it
                  well enough. */}
              {section && (
                <div className={cn('mt-1', !collapsed && 'ml-[1.4rem] border-l border-border pl-3')}>
                  <div className="space-y-0.5">
                    {section.items.map((sub) => (
                      <NavRow
                        key={sub.to}
                        item={sub}
                        collapsed={collapsed}
                        active={
                          !!sub.matchPrefix && location.pathname.startsWith(sub.matchPrefix)
                        }
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              )}

              {!collapsed && visibleChildren && visibleChildren.length > 0 && (
                <div className="ml-[1.4rem] mt-0.5 space-y-px border-l border-border pl-3">
                  {visibleChildren.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={onNavigate}
                      end
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-8 items-center rounded-md px-2 text-[0.8125rem] transition-colors',
                          isActive
                            ? 'font-semibold text-accent-primary'
                            : 'font-medium text-text-secondary hover:text-text-primary',
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

      <div className="border-t border-border pt-2.5">{!collapsed && <UserMenu />}</div>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const width = useSidebarStore((s) => s.width)
  const resizing = useSidebarStore((s) => s.resizing)
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)

  return (
    <>
      {/* Desktop: persistent, drag-resizable, snaps to an icon rail */}
      <aside
        style={{ width: collapsed ? SIDEBAR_MIN_WIDTH : width }}
        className={cn(
          'relative hidden shrink-0 border-r border-border bg-surface lg:block',
          // Animate the snap between rail and expanded, but NOT while dragging:
          // a transition on width makes the edge lag the pointer.
          !resizing && 'transition-[width] duration-200 ease-out',
        )}
      >
        <SidebarContent collapsed={collapsed} />
        <SidebarResizer />
        <Button
          variant="outline"
          size="icon"
          onClick={toggleCollapsed}
          className="absolute -right-3.5 top-3 z-30 hidden size-7 rounded-full bg-surface shadow-e1 lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-3.5 text-icon" />
          ) : (
            <PanelLeftClose className="size-3.5 text-icon" />
          )}
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
          <div className="relative z-10 h-full w-72 bg-surface shadow-e3">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="type-heading">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-4 text-icon" />
              </Button>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}

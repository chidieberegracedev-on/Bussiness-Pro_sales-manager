import { NavLink, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_GROUPS, NAV_SECTIONS, type NavItem } from '@/components/layout/nav-config'
import { useSidebarStore, SIDEBAR_MIN_WIDTH } from '@/components/layout/sidebar-store'
import { SidebarResizer } from '@/components/layout/sidebar-resizer'
import { BusinessSwitcher } from '@/components/layout/business-switcher'
import { BrandMark, BusinessProWordmark } from '@/components/layout/brand'
import { UserMenu } from '@/components/layout/user-menu'
import { useActiveBusiness } from '@/features/business/hooks'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The brand IS the collapse control (brief §7). Expanded, the wordmark shows a
 * collapse chevron on hover; collapsed, the mark shows an expand chevron. No
 * separate button floats beside it — a legacy "Collapse" affordance is exactly
 * the administrative feel this refinement is removing.
 */
function BrandToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={cn(
        'group/brand relative flex h-10 items-center rounded-lg transition-colors hover:bg-surface-muted',
        collapsed ? 'w-10 justify-center' : 'w-full px-1.5',
      )}
    >
      {collapsed ? (
        <>
          <BrandMark className="size-6 transition-opacity group-hover/brand:opacity-0" />
          <PanelLeftOpen className="absolute size-4 text-icon opacity-0 transition-opacity group-hover/brand:opacity-100" />
        </>
      ) : (
        <>
          <BusinessProWordmark />
          <PanelLeftClose className="ml-auto size-4 text-icon-muted opacity-0 transition-opacity group-hover/brand:opacity-100" />
        </>
      )}
    </button>
  )
}

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
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)

  // A PIN-unlocked operator's role governs what they see; without one the device
  // account's role applies. Hiding is UX only — the server enforces the boundary.
  const role = sessionContext?.status === 'active' ? sessionContext.role : deviceRole

  const sections = NAV_SECTIONS.filter(
    (section) =>
      location.pathname.startsWith(section.activeWhenPathStartsWith) &&
      (!section.roles || (role && section.roles.includes(role))),
  )

  const withinItem = (item: NavItem) => {
    if (item.matchPrefix && location.pathname.startsWith(item.matchPrefix)) return true
    if (item.children?.some((c) => location.pathname.startsWith(c.to))) return true
    return location.pathname === item.to
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className={cn('flex', collapsed ? 'justify-center' : 'px-0.5')}>
        <BrandToggle collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {!collapsed && (
        <div className="px-0.5">
          <BusinessSwitcher />
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Primary">
        {NAV_GROUPS.map((group, groupIndex) => {
          const groupItems = group.items
            .filter((item) => !item.roles || (role && item.roles.includes(role)))
            .map((item) =>
              // A cashier may open Settings, but only Appearance is theirs; the
              // default target is management-only, so point them at the tab they
              // can actually use rather than a permission wall.
              item.label === 'Settings' && role !== 'owner' && role !== 'manager'
                ? { ...item, to: '/settings/appearance' }
                : item,
            )
          if (groupItems.length === 0) return null

          return (
            <div key={group.title ?? `pinned-${groupIndex}`} className="pb-1.5">
              {/* A quiet domain label expanded; a hairline divider collapsed,
                  since a header with no room to read is just noise. The first
                  (pinned) group has neither. */}
              {group.title &&
                (collapsed ? (
                  <div className="mx-auto my-1.5 h-px w-6 bg-border" aria-hidden="true" />
                ) : (
                  <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-text-muted">
                    {group.title}
                  </p>
                ))}

              <div className="space-y-0.5">
                {groupItems.map((item) => {
                  const active = withinItem(item)
                  const visibleChildren = item.children?.filter(
                    (c) => !c.roles || (role && c.roles.includes(role)),
                  )
                  const section = sections.find((s) => s.activeWhenPathStartsWith === item.to)
                  // The wall of links came from showing EVERY item's children at
                  // all times. Children (and the workspace section) now appear
                  // only for the area you are actually in — orientation without
                  // the whole product architecture on screen at once (brief §1).
                  const revealChildren = !collapsed && active

                  return (
                    <div key={item.label}>
                      <NavRow
                        item={item}
                        collapsed={collapsed}
                        active={active}
                        onNavigate={onNavigate}
                      />

                      {revealChildren && section && (
                        <div className="ml-[1.4rem] mt-0.5 border-l border-border pl-3">
                          <div className="space-y-0.5">
                            {section.items.map((sub) => (
                              <NavRow
                                key={sub.to}
                                item={sub}
                                collapsed={false}
                                active={
                                  !!sub.matchPrefix && location.pathname.startsWith(sub.matchPrefix)
                                }
                                onNavigate={onNavigate}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {revealChildren && visibleChildren && visibleChildren.length > 0 && (
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
              </div>
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
        {/* The brand at the top of SidebarContent is the collapse control now
            (brief §7); the drag handle stays for fine width control. */}
        <SidebarContent collapsed={collapsed} />
        <SidebarResizer />
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

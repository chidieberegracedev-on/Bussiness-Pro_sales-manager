import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Menu,
  Monitor,
  Palette,
  Printer,
  ShieldCheck,
  Store,
  Tags,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BusinessProWordmark } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'
import { useActiveBusiness } from '@/features/business/hooks'
import { useBusinessVertical, usePosConfig } from '@/features/pos/use-pos-config'
import type { MemberRole } from '@/types/database'

const ALL_ROLES: MemberRole[] = ['owner', 'manager', 'inventory_staff', 'cashier']
const MANAGE: MemberRole[] = ['owner', 'manager']

interface SettingsLink {
  to: string
  label: string
  icon: LucideIcon
  roles: MemberRole[]
  /** Only shown when the business actually has a floor to plan. */
  restaurantOnly?: boolean
}

interface SettingsGroup {
  title: string
  links: SettingsLink[]
}

/**
 * Settings navigation, grouped into domains — the same information-architecture
 * principle as the global shell, scoped to configuration. Every entry points at
 * a route that already exists; nothing here is invented to fill the list.
 */
const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: 'General',
    links: [{ to: '/settings/business', label: 'Business', icon: Building2, roles: MANAGE }],
  },
  {
    title: 'Operations',
    links: [
      { to: '/settings/categories', label: 'Categories', icon: Tags, roles: MANAGE },
      { to: '/settings/pos', label: 'Till', icon: Store, roles: MANAGE },
      {
        to: '/settings/floor-plan',
        label: 'Floor plan',
        icon: UtensilsCrossed,
        roles: MANAGE,
        restaurantOnly: true,
      },
      { to: '/settings/terminals', label: 'Terminals', icon: Monitor, roles: MANAGE },
      { to: '/settings/printing', label: 'Printing & scanning', icon: Printer, roles: MANAGE },
    ],
  },
  {
    title: 'People & access',
    links: [
      { to: '/settings/permissions', label: 'Roles & permissions', icon: ShieldCheck, roles: MANAGE },
    ],
  },
  {
    title: 'Experience',
    links: [{ to: '/settings/appearance', label: 'Appearance', icon: Palette, roles: ALL_ROLES }],
  },
]

function SettingsNav({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useActiveBusiness()
  const vertical = useBusinessVertical()
  const { data: config } = usePosConfig()
  const showFloorPlan = vertical === 'restaurant' || !!config?.tables_enabled

  const groups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter(
      (link) => (!role || link.roles.includes(role)) && (!link.restaurantOnly || showFloorPlan),
    ),
  })).filter((group) => group.links.length > 0)

  return (
    <nav className="space-y-4" aria-label="Settings sections">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-text-muted">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group/set flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                    isActive
                      ? 'bg-tint-accent font-semibold text-tint-accent-foreground'
                      : 'font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <link.icon
                      className={cn(
                        'size-[1.125rem] shrink-0',
                        isActive ? 'text-current' : 'text-icon group-hover/set:text-text-primary',
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{link.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/**
 * Settings is its own workspace (brief §11), not a page inside the management
 * dashboard. It has its own shell: brand, a "Back to app" return, a grouped
 * settings sidebar, and a content area that uses the full viewport. Individual
 * pages decide their own readable width — the workspace is full-width, the forms
 * inside it are not forced to be.
 */
export function SettingsLayout() {
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const [mobileNav, setMobileNav] = useState(false)
  // Owners/managers came from the dashboard; a cashier's home is their own work.
  const backTo = role === 'owner' || role === 'manager' ? '/dashboard' : '/me'

  const rail = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-2 pt-1">
        <BusinessProWordmark />
      </div>
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          navigate(backTo)
        }}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
      >
        <ArrowLeft className="size-4 text-icon" aria-hidden="true" />
        Back to app
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SettingsNav onNavigate={onNavigate} />
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-background-subtle">
      {/* Desktop: the settings rail replaces the global sidebar entirely, so the
          user feels they have ENTERED settings rather than opened one more
          management page. */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        {rail()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header: brand + a control to reach the settings nav. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNav(true)}
            aria-label="Open settings navigation"
          >
            <Menu className="size-5" />
          </Button>
          <span className="text-sm font-semibold text-text-primary">Settings</span>
        </header>

        {/* The workspace is full-width; the content column is capped so forms
            keep a readable line length on a wide monitor without collapsing to
            the old narrow centre column. Wide enough that the POS settings'
            two-column layout still gets its room. */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-9">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>

      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close settings navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNav(false)}
          />
          <div className="relative z-10 h-full w-72 bg-surface shadow-e3">
            <div className="flex items-center justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileNav(false)}
                aria-label="Close settings navigation"
              >
                <X className="size-4 text-icon" />
              </Button>
            </div>
            {rail(() => setMobileNav(false))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const STORAGE_PREFIX = 'bp-workspace-nav'

export interface WorkspaceNavItem {
  label: string
  /** Omit for a pure action row (a panel opener rather than a route). */
  to?: string
  icon: LucideIcon
  /** Small count on the right of the row — held baskets, unread, etc. */
  badge?: number | string
  onClick?: () => void
  /** Force the selected treatment for a row that isn't a route. */
  active?: boolean
  end?: boolean
}

export interface WorkspaceNavGroup {
  /** Small caps label. Omit for the first, unlabelled group. */
  title?: string
  items: WorkspaceNavItem[]
}

/**
 * The shell for a ROLE-SCOPED workspace.
 *
 * A cashier does not get the owner's fifteen-item sidebar with things hidden —
 * that reads as "the admin console, restricted", which is exactly the feeling
 * this replaces. They get their own environment whose navigation contains only
 * the things their job is made of.
 *
 * Deliberately NOT the global AppShell: it carries no business switcher, no
 * settings, no cross-module nav. The only route out is the one this component
 * is given.
 */
export function WorkspaceShell({
  id,
  brand,
  context,
  groups,
  footer,
  topBar,
  children,
}: {
  /** Namespaces the persisted collapse state, so POS and Employee differ. */
  id: string
  brand: ReactNode
  /** The "which shop / which till" card under the brand. */
  context?: ReactNode
  groups: WorkspaceNavGroup[]
  footer?: ReactNode
  topBar?: ReactNode
  children: ReactNode
}) {
  const storageKey = `${STORAGE_PREFIX}-${id}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(collapsed))
    } catch {
      // A remembered rail width is not worth breaking the till over.
    }
  }, [collapsed, storageKey])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          'relative hidden shrink-0 flex-col bg-surface transition-[width] duration-200 ease-out lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-[16.5rem]',
        )}
      >
        <div className={cn('flex items-center gap-2.5 px-4 pb-2 pt-5', collapsed && 'justify-center px-2')}>
          {brand}
        </div>

        {context && !collapsed && <div className="px-3 pb-1 pt-2">{context}</div>}

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Workspace">
          {groups.map((group, groupIndex) => (
            <div key={group.title ?? groupIndex} className={groupIndex > 0 ? 'mt-5' : undefined}>
              {group.title && !collapsed && (
                <p className="type-eyebrow mb-2 px-2.5">{group.title}</p>
              )}
              {group.title && collapsed && (
                <div className="mx-auto mb-2.5 h-px w-7 bg-border" aria-hidden="true" />
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <WorkspaceNavRow key={item.label} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {footer && <div className="px-3 pb-3">{footer}</div>}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={cn(
            'mx-3 mb-4 flex h-9 items-center gap-2.5 rounded-xl px-3 text-[0.8125rem] font-semibold',
            'text-text-muted transition-colors hover:bg-background hover:text-text-primary',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" /> Collapse
            </>
          )}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}

function WorkspaceNavRow({ item, collapsed }: { item: WorkspaceNavItem; collapsed: boolean }) {
  const shared = cn(
    'group/row flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
    collapsed && 'mx-auto size-11 justify-center px-0',
  )

  const body = (isActive: boolean) => (
    <>
      <item.icon
        className={cn(
          'size-[1.15rem] shrink-0 transition-colors',
          isActive ? 'text-current' : 'text-icon group-hover/row:text-text-primary',
        )}
        aria-hidden="true"
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
      {!collapsed && item.badge != null && item.badge !== 0 && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums',
            isActive ? 'bg-surface/25 text-current' : 'bg-tint-accent text-tint-accent-foreground',
          )}
        >
          {item.badge}
        </span>
      )}
    </>
  )

  const selected = (isActive: boolean) =>
    cn(
      shared,
      isActive || item.active
        ? 'bg-accent-primary text-primary-foreground shadow-e1'
        : 'text-text-secondary hover:bg-background hover:text-text-primary',
    )

  const node = item.to ? (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={item.onClick}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => selected(isActive || !!item.active)}
    >
      {({ isActive }) => body(isActive || !!item.active)}
    </NavLink>
  ) : (
    <button
      type="button"
      onClick={item.onClick}
      aria-label={collapsed ? item.label : undefined}
      className={selected(!!item.active)}
    >
      {body(!!item.active)}
    </button>
  )

  // Collapsed, the row's only content is an aria-hidden icon, so the tooltip is
  // a convenience and the aria-label above is what actually names it.
  if (!collapsed) return node
  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.badge != null && item.badge !== 0 ? ` · ${item.badge}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The top bar for a workspace: title on the left, tool icons on the right.
 *
 * Secondary operations live here rather than on the selling surface. A cashier
 * ringing up a queue should see products and a cart, not six admin buttons
 * competing with Charge.
 */
export function WorkspaceTopBar({
  title,
  subtitle,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 bg-surface px-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <div className="type-heading truncate">{title}</div>
        {subtitle && <div className="type-meta truncate">{subtitle}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </header>
  )
}

/** A top-bar tool: icon button that opens a panel, with an optional dot/count. */
export function WorkspaceTool({
  icon: Icon,
  label,
  badge,
  onClick,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  badge?: number | string
  onClick: () => void
  tone?: 'neutral' | 'warning'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'relative flex size-11 items-center justify-center rounded-xl transition-colors',
            tone === 'warning'
              ? 'bg-tint-warning text-tint-warning-foreground hover:brightness-95'
              : 'text-icon hover:bg-background hover:text-text-primary',
          )}
        >
          <Icon className="size-[1.15rem]" aria-hidden="true" />
          {badge != null && badge !== 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent-primary px-1 text-[0.625rem] font-bold text-primary-foreground">
              {badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

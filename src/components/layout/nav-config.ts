import type { LucideIcon } from 'lucide-react'
import {
  Package,
  AlertTriangle,
  History,
  Settings,
  ShoppingCart,
  Receipt,
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  Warehouse,
  Truck,
  FileText,
  ShoppingBag,
  Repeat,
  Wallet,
  Clock,
  BookOpen,
  MessagesSquare,
  DollarSign,
  GraduationCap,
  BookA,
  Calculator,
  Compass,
  ShieldCheck,
  Users,
  Scale,
  ShieldQuestion,
  ClipboardList,
  Globe,
  Link2,
  Store,
  Search,
  Tag,
  UserRound,
} from 'lucide-react'
import type { MemberRole } from '@/types/database'

const BACKROOM: MemberRole[] = ['owner', 'manager', 'inventory_staff']
const MANAGEMENT: MemberRole[] = ['owner', 'manager']

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles?: MemberRole[]
  children?: NavItem[]
  /** Match this prefix for the active state instead of the exact path. */
  matchPrefix?: string
}

/**
 * A titled group of nav items rendered below the global list.
 *
 * The marketplace has its own workspace-level navigation — Home, Search,
 * Compare, Quotes, Orders, Escrow, Wallet, Saved, Selling — and it does NOT
 * get its own sidebar. It is injected here as a section inside the global one,
 * so the user never feels they left the Business OS (brief §3).
 */
export interface NavSection {
  /** Small caps label above the group. */
  title: string
  /** Only shown when the current path is inside the workspace. */
  activeWhenPathStartsWith: string
  roles?: MemberRole[]
  items: NavItem[]
}

/** A titled block of top-level destinations in the global sidebar. */
export interface NavGroup {
  /** Small-caps domain label. Absent for the pinned top block. */
  title?: string
  items: NavItem[]
}

/**
 * The global navigation, grouped into DOMAINS rather than a flat wall of links.
 *
 * The point is orientation: a user entering the app should see a handful of
 * areas — "where can I go" — not thirty destinations at once. Each top-level
 * item still owns its children, but those children are revealed only when their
 * area is the one you are in (see the sidebar), so the resting state stays
 * calm. Section titles are quiet; the accent is spent on the selected row, not
 * on the headers.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    // Pinned, header-less: the three things anyone starts a session from. Two
    // of them leave the management shell for a role-scoped workspace — that is
    // deliberate, not an accident of routing.
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: MANAGEMENT },
      { label: 'Open the till', to: '/till', icon: ShoppingCart, roles: MANAGEMENT },
      { label: 'My work', to: '/me', icon: UserRound },
    ],
  },
  {
    title: 'Operate',
    items: [
      { label: 'Sales', to: '/sales', icon: Receipt, roles: MANAGEMENT },
      {
        label: 'Inventory',
        to: '/inventory/low-stock',
        icon: AlertTriangle,
        roles: BACKROOM,
        children: [
          { label: 'Low stock', to: '/inventory/low-stock', icon: AlertTriangle },
          { label: 'Stock movements', to: '/inventory/movements', icon: History, roles: BACKROOM },
          { label: 'Stock counts', to: '/inventory/counts', icon: ClipboardList, roles: BACKROOM },
        ],
      },
      {
        label: 'Purchasing',
        to: '/purchase-orders',
        icon: ShoppingBag,
        roles: BACKROOM,
        matchPrefix: '/purchase',
        children: [
          { label: 'Purchase Orders', to: '/purchase-orders', icon: FileText },
          { label: 'Suppliers', to: '/suppliers', icon: Truck },
          { label: 'Restock', to: '/restock', icon: Repeat, roles: BACKROOM },
          { label: 'Purchase History', to: '/purchase-history', icon: History },
        ],
      },
    ],
  },
  {
    title: 'Manage',
    items: [
      { label: 'Products', to: '/products', icon: Package, roles: BACKROOM, matchPrefix: '/products' },
      {
        label: 'Team & Control',
        to: '/employees',
        icon: ShieldCheck,
        roles: MANAGEMENT,
        matchPrefix: '/control',
        children: [
          { label: 'Employees', to: '/employees', icon: Users },
          { label: 'Performance', to: '/control/performance', icon: BarChart3 },
          { label: 'Live shifts', to: '/control/live-shifts', icon: Clock },
          { label: 'Reconciliation', to: '/control/reconciliation', icon: Scale },
          { label: 'Exceptions', to: '/control/exceptions', icon: ShieldQuestion },
          { label: 'Activity log', to: '/control/activity', icon: History },
        ],
      },
    ],
  },
  {
    title: 'Insights',
    items: [
      {
        label: 'Reports',
        to: '/reports/sales',
        icon: BarChart3,
        roles: MANAGEMENT,
        matchPrefix: '/reports',
        children: [
          { label: 'Sales Report', to: '/reports/sales', icon: Receipt },
          { label: 'Product Performance', to: '/reports/products', icon: TrendingUp },
          { label: 'Inventory Intelligence', to: '/reports/inventory', icon: Warehouse },
        ],
      },
      {
        label: 'Finance',
        to: '/finance',
        icon: Wallet,
        roles: MANAGEMENT,
        matchPrefix: '/finance',
        children: [
          { label: 'Overview', to: '/finance', icon: DollarSign, roles: MANAGEMENT },
          { label: 'Cashbook', to: '/finance/cashbook', icon: BookOpen, roles: MANAGEMENT },
          { label: 'Expenses', to: '/expenses', icon: Receipt },
          { label: 'Shifts', to: '/shifts', icon: Clock },
        ],
      },
    ],
  },
  {
    title: 'Network',
    items: [
      // No children: inside /network the SUPPLIER NETWORK section below takes
      // over, so listing its destinations here too would double them up.
      { label: 'Supplier Network', to: '/network', icon: Globe, roles: MANAGEMENT, matchPrefix: '/network' },
    ],
  },
  {
    title: 'Learn',
    items: [
      {
        label: 'Help & Learning',
        to: '/help/learning',
        icon: GraduationCap,
        matchPrefix: '/help',
        children: [
          { label: 'Learning Center', to: '/help/learning', icon: Compass },
          { label: 'Dictionary', to: '/help/dictionary', icon: BookA },
          { label: 'Calculator', to: '/help/calculator', icon: Calculator },
        ],
      },
    ],
  },
  {
    title: 'System',
    items: [{ label: 'Settings', to: '/settings/business', icon: Settings, matchPrefix: '/settings' }],
  },
]

/** Flat list, for anything that needs every destination regardless of group. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/**
 * Workspace sections — nav that appears INSIDE the global sidebar when the
 * user is in that part of the app, below the global list.
 *
 * Only destinations that actually exist are listed. The marketplace roadmap
 * (Compare Suppliers, Quotes, Escrow, Wallet, Saved Suppliers) lands here one
 * slice at a time; a nav entry pointing at a route that isn't built yet is a
 * dead end wearing a label.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Supplier Network',
    activeWhenPathStartsWith: '/network',
    roles: MANAGEMENT,
    items: [
      { label: 'Home', to: '/network', icon: Compass },
      { label: 'Search products', to: '/network/search', icon: Search },
      { label: 'Messages', to: '/network/messages', icon: MessagesSquare, matchPrefix: '/network/messages' },
      { label: 'Connections', to: '/network/connections', icon: Link2 },
      { label: 'My storefront', to: '/network/my-profile', icon: Store },
      { label: 'My listings (selling)', to: '/network/my-listings', icon: Tag },
    ],
  },
]

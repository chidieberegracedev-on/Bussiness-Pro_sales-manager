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
  DollarSign,
  GraduationCap,
  BookA,
  Calculator,
  Compass,
  ShieldCheck,
  Users,
  Scale,
  ShieldQuestion,
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
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: MANAGEMENT },
  { label: 'POS', to: '/pos', icon: ShoppingCart, roles: MANAGEMENT },
  { label: 'Sales', to: '/sales', icon: Receipt, roles: MANAGEMENT },
  { label: 'Products', to: '/products', icon: Package, roles: BACKROOM },
  {
    label: 'Inventory',
    to: '/inventory/low-stock',
    icon: AlertTriangle,
    roles: BACKROOM,
    children: [
      { label: 'Low stock', to: '/inventory/low-stock', icon: AlertTriangle },
      { label: 'Stock movements', to: '/inventory/movements', icon: History, roles: BACKROOM },
    ],
  },
  {
    label: 'Purchasing',
    to: '/purchase-orders',
    icon: ShoppingBag,
    roles: BACKROOM,
    children: [
      { label: 'Purchase Orders', to: '/purchase-orders', icon: FileText },
      { label: 'Suppliers', to: '/suppliers', icon: Truck },
      { label: 'Restock', to: '/restock', icon: Repeat, roles: BACKROOM },
      { label: 'Purchase History', to: '/purchase-history', icon: History },
    ],
  },
  {
    label: 'Finance',
    to: '/expenses',
    icon: Wallet,
    roles: MANAGEMENT,
    children: [
      { label: 'Overview', to: '/finance', icon: DollarSign, roles: MANAGEMENT },
      { label: 'Cashbook', to: '/finance/cashbook', icon: BookOpen, roles: MANAGEMENT },
      { label: 'Expenses', to: '/expenses', icon: Receipt },
      { label: 'Shifts', to: '/shifts', icon: Clock },
    ],
  },
  {
    label: 'Team & Control',
    to: '/employees',
    icon: ShieldCheck,
    roles: MANAGEMENT,
    children: [
      { label: 'Employees', to: '/employees', icon: Users },
      { label: 'Live shifts', to: '/control/live-shifts', icon: Clock },
      { label: 'Reconciliation', to: '/control/reconciliation', icon: Scale },
      { label: 'Exceptions', to: '/control/exceptions', icon: ShieldQuestion },
      { label: 'Activity log', to: '/control/activity', icon: History },
    ],
  },
  {
    label: 'Reports',
    to: '/reports/sales',
    icon: BarChart3,
    roles: MANAGEMENT,
    children: [
      { label: 'Sales Report', to: '/reports/sales', icon: Receipt },
      { label: 'Product Performance', to: '/reports/products', icon: TrendingUp },
      { label: 'Inventory Intelligence', to: '/reports/inventory', icon: Warehouse },
    ],
  },
  {
    label: 'Help & Learning',
    to: '/help/learning',
    icon: GraduationCap,
    children: [
      { label: 'Learning Center', to: '/help/learning', icon: Compass },
      { label: 'Dictionary', to: '/help/dictionary', icon: BookA },
      { label: 'Calculator', to: '/help/calculator', icon: Calculator },
    ],
  },
  { label: 'Settings', to: '/settings/business', icon: Settings },
]

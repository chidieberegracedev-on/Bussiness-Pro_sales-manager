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
} from 'lucide-react'
import type { MemberRole } from '@/types/database'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles?: MemberRole[]
  children?: NavItem[]
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'POS', to: '/pos', icon: ShoppingCart },
  { label: 'Sales', to: '/sales', icon: Receipt },
  { label: 'Products', to: '/products', icon: Package },
  {
    label: 'Inventory',
    to: '/inventory/low-stock',
    icon: AlertTriangle,
    children: [
      { label: 'Low stock', to: '/inventory/low-stock', icon: AlertTriangle },
      { label: 'Stock movements', to: '/inventory/movements', icon: History, roles: ['owner', 'manager'] },
    ],
  },
  {
    label: 'Purchasing',
    to: '/purchase-orders',
    icon: ShoppingBag,
    children: [
      { label: 'Purchase Orders', to: '/purchase-orders', icon: FileText },
      { label: 'Suppliers', to: '/suppliers', icon: Truck },
      { label: 'Restock', to: '/restock', icon: Repeat, roles: ['owner', 'manager'] },
      { label: 'Purchase History', to: '/purchase-history', icon: History },
    ],
  },
  {
    label: 'Finance',
    to: '/expenses',
    icon: Wallet,
    children: [
      { label: 'Overview', to: '/finance', icon: DollarSign, roles: ['owner', 'manager'] },
      { label: 'Cashbook', to: '/finance/cashbook', icon: BookOpen, roles: ['owner', 'manager'] },
      { label: 'Expenses', to: '/expenses', icon: Receipt },
      { label: 'Shifts', to: '/shifts', icon: Clock },
    ],
  },
  {
    label: 'Reports',
    to: '/reports/sales',
    icon: BarChart3,
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

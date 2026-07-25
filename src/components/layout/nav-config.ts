import type { LucideIcon } from 'lucide-react'
import { Package, AlertTriangle, History, Settings, ShoppingCart, Receipt } from 'lucide-react'
import type { MemberRole } from '@/types/database'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles?: MemberRole[]
  children?: NavItem[]
}

// Do not add placeholder entries for unbuilt sections (WEB_IMPLEMENTATION.md §7).
export const NAV_ITEMS: NavItem[] = [
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
  // Settings is visible to every member — Appearance is Member-accessible even
  // though Business and Categories require Owner/Manager (see routes table).
  { label: 'Settings', to: '/settings/business', icon: Settings },
]

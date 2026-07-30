import type { AuthorizedAction, MemberRole } from '@/types/database'

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  inventory_staff: 'Inventory staff',
  cashier: 'Cashier',
}

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Unrestricted access, including employee setup and permission limits.',
  manager: 'Full shop floor plus override powers. Cannot delete activity history.',
  inventory_staff: 'Backroom catalog, purchasing, and receiving. No register or cash drawer.',
  cashier: 'Register workspace only — selling, baskets, receipts, and their own shift.',
}

export const ACTION_LABELS: Record<AuthorizedAction, string> = {
  discount: 'Discount',
  refund: 'Refund',
  petty_cash: 'Petty cash',
  inventory_adjustment: 'Stock adjustment',
  safe_drop: 'Safe drop',
  void: 'Void / clear basket',
}

export const ACTION_DESCRIPTIONS: Record<AuthorizedAction, string> = {
  discount: 'How much can be taken off a price before a manager must approve.',
  refund: 'The largest refund that can be given without approval.',
  petty_cash: 'The most that can be paid out of the drawer for small expenses.',
  inventory_adjustment: 'How many units of stock can be corrected in one adjustment.',
  safe_drop: 'Whether cash can be moved from the drawer to the safe unaided.',
  void: 'Whether a line or a whole basket can be cleared without approval.',
}

/** Which limit column an action is measured in. */
export const ACTION_MEASURE: Record<AuthorizedAction, 'amount' | 'percent' | 'quantity' | 'allowed'> = {
  discount: 'percent',
  refund: 'amount',
  petty_cash: 'amount',
  inventory_adjustment: 'quantity',
  safe_drop: 'allowed',
  void: 'allowed',
}

export const ALL_ACTIONS: AuthorizedAction[] = [
  'discount',
  'refund',
  'petty_cash',
  'inventory_adjustment',
  'safe_drop',
  'void',
]

/** Roles whose limits are configurable — owner is always unrestricted. */
export const CONFIGURABLE_ROLES: MemberRole[] = ['manager', 'inventory_staff', 'cashier']

export function isManagementRole(role: MemberRole | undefined): boolean {
  return role === 'owner' || role === 'manager'
}

export function canApprove(role: MemberRole | undefined): boolean {
  return role === 'owner' || role === 'manager'
}

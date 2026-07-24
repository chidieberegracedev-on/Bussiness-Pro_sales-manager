import { Badge } from '@/components/ui/badge'
import type { StockMovementType } from '@/types/database'

const LABELS: Record<StockMovementType, string> = {
  initial: 'Opening stock',
  restock: 'Restock',
  sale: 'Sale',
  sale_reversal: 'Return',
  adjustment: 'Adjustment',
  damage: 'Damage',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
}

const VARIANTS: Record<StockMovementType, 'success' | 'info' | 'warning' | 'danger' | 'muted'> = {
  initial: 'info',
  restock: 'success',
  sale: 'muted',
  sale_reversal: 'info',
  adjustment: 'warning',
  damage: 'danger',
  transfer_in: 'info',
  transfer_out: 'info',
}

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  return <Badge variant={VARIANTS[type]}>{LABELS[type]}</Badge>
}

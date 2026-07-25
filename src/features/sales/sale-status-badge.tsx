import { Badge } from '@/components/ui/badge'
import type { SaleStatus } from '@/types/database'

const LABELS: Record<SaleStatus, string> = {
  completed: 'Completed',
  voided: 'Voided',
}

const VARIANTS: Record<SaleStatus, 'success' | 'danger'> = {
  completed: 'success',
  voided: 'danger',
}

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>
}

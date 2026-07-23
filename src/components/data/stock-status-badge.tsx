import { AlertTriangle, XCircle, TrendingDown, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { StockStatus } from '@/types/database'

// Status is never colour alone — every status carries an icon and a text
// label (BR-6.2, AC-6.5, AC-10.5).
const STATUS_CONFIG: Record<StockStatus, { label: string; icon: typeof AlertTriangle; variant: 'danger' | 'muted' | 'warning' | 'success' }> = {
  negative: { label: 'Negative', icon: AlertTriangle, variant: 'danger' },
  out_of_stock: { label: 'Out of stock', icon: XCircle, variant: 'muted' },
  low: { label: 'Low stock', icon: TrendingDown, variant: 'warning' },
  ok: { label: 'In stock', icon: CheckCircle2, variant: 'success' },
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <Badge variant={config.variant}>
      <Icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </Badge>
  )
}

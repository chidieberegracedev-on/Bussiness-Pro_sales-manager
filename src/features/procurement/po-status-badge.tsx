import { CheckCircle2, Circle, FileEdit, PackageCheck, XCircle } from 'lucide-react'
import type { PoStatus } from '@/types/database'
import { cn } from '@/lib/utils'

const CONFIG: Record<PoStatus, { label: string; className: string; Icon: typeof Circle }> = {
  draft: {
    label: 'Draft',
    className: 'bg-surface-muted text-text-secondary',
    Icon: FileEdit,
  },
  ordered: {
    label: 'Ordered',
    className: 'bg-info/10 text-info',
    Icon: Circle,
  },
  partially_received: {
    label: 'Partially received',
    className: 'bg-warning/10 text-warning',
    Icon: PackageCheck,
  },
  completed: {
    label: 'Completed',
    className: 'bg-success/10 text-success',
    Icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-danger/10 text-danger',
    Icon: XCircle,
  },
}

export function PoStatusBadge({ status, className }: { status: PoStatus; className?: string }) {
  const c = CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        c.className,
        className,
      )}
    >
      <c.Icon className="size-3" />
      {c.label}
    </span>
  )
}

export function PoItemStatusBadge({ status }: { status: 'pending' | 'partial' | 'complete' }) {
  const config = {
    pending: { label: 'Pending', className: 'bg-surface-muted text-text-secondary' },
    partial: { label: 'Partial', className: 'bg-warning/10 text-warning' },
    complete: { label: 'Complete', className: 'bg-success/10 text-success' },
  }[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
      )}
    >
      {config.label}
    </span>
  )
}

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox, FilterX } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Icon className="size-10 text-text-muted" aria-hidden="true" />
      <h3 className="mt-4 text-base font-semibold text-text-primary">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={FilterX}
      title="No results match your filters"
      description="Try adjusting or clearing your filters to see more."
      action={
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  )
}

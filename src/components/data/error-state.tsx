import { AlertCircle, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toReadableError } from '@/lib/errors'

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-danger/30 bg-danger/5 px-6 py-16 text-center">
      <AlertCircle className="size-10 text-danger" aria-hidden="true" />
      <h3 className="mt-4 text-base font-semibold text-text-primary">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">{toReadableError(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function PermissionDeniedState({ requiredRole }: { requiredRole: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <ShieldAlert className="size-10 text-text-muted" aria-hidden="true" />
      <h3 className="mt-4 text-base font-semibold text-text-primary">You don't have access to this</h3>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        This requires <span className="font-medium capitalize">{requiredRole}</span> access. Ask an owner or manager
        if you need this permission.
      </p>
    </div>
  )
}

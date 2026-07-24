import { Loader2 } from 'lucide-react'

export function FullPageLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background" role="status" aria-label="Loading">
      <Loader2 className="size-8 animate-spin text-text-muted" />
    </div>
  )
}

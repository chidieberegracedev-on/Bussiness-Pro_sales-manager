import { WifiOff } from 'lucide-react'

export function OfflineNotice() {
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-muted">
      <WifiOff className="size-3.5" /> You're offline — reconnect to save changes.
    </p>
  )
}

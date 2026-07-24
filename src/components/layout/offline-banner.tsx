import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/use-online-status'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning"
    >
      <WifiOff className="size-4" />
      You're offline. Showing cached data — changes are disabled until you reconnect.
    </div>
  )
}

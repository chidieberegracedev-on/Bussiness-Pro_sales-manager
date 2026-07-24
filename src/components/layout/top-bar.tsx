import { Menu } from 'lucide-react'
import { useSidebarStore } from '@/components/layout/sidebar-store'
import { useActiveBusiness } from '@/features/business/hooks'
import { Button } from '@/components/ui/button'

export function TopBar() {
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  const { business } = useActiveBusiness()

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
      <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <span className="truncate text-sm font-semibold">{business?.name ?? 'Business Pro'}</span>
    </header>
  )
}

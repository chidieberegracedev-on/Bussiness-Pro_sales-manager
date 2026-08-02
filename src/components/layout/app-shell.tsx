import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { OfflineBanner } from '@/components/layout/offline-banner'
import { AddStockDialog } from '@/features/inventory/add-stock-dialog'
import { AdjustStockDialog } from '@/features/inventory/adjust-stock-dialog'
import { FloatingCalculator } from '@/features/help/floating-calculator'

export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background-subtle">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <OfflineBanner />
        {/* Whitespace is doing the work shadows used to: cards separate by
            contrast against the warm page and by the air between them. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-9">
          <Outlet />
        </main>
      </div>
      <AddStockDialog />
      <AdjustStockDialog />
      <FloatingCalculator />
    </div>
  )
}

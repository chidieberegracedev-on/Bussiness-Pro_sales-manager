import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { AuthProvider } from '@/features/auth/auth-provider'
import { ScanEngineProvider } from '@/features/scan/scan-engine'
import { ErrorBoundary } from '@/app/error-boundary'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          {/* One capture layer for the whole app. Screens subscribe to resolved
              scans; nothing else listens to the keyboard for barcodes. */}
          {/* Last line of defence. A render throw below this shows a message
              instead of a white page. */}
          <ErrorBoundary>
            <ScanEngineProvider>{children}</ScanEngineProvider>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

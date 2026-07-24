import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Store } from 'lucide-react'
import { useMyMemberships } from '@/features/business/hooks'
import { useBusinessStore } from '@/features/business/store'
import { TableSkeleton } from '@/components/data/loading-state'
import { ErrorState } from '@/components/data/error-state'
import { Card } from '@/components/ui/card'

export function SelectBusinessPage() {
  const { data: memberships, isLoading, isError, refetch } = useMyMemberships()
  const setActiveBusiness = useBusinessStore((s) => s.setActiveBusiness)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  function handleSelect(businessId: string) {
    queryClient.clear()
    setActiveBusiness(businessId)
    navigate('/products', { replace: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-subtle px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">Choose a business</h1>
          <p className="mt-1 text-sm text-text-secondary">Select which business you want to work in.</p>
        </div>

        {isLoading && <TableSkeleton rows={3} columns={1} />}
        {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

        {memberships && (
          <div className="space-y-2">
            {memberships.map((m) => (
              <Card key={m.business.id} className="p-0">
                <button
                  type="button"
                  onClick={() => handleSelect(m.business.id)}
                  className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                    <Building2 className="size-5 text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">{m.business.name}</p>
                    <p className="text-xs capitalize text-text-muted">{m.role}</p>
                  </div>
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

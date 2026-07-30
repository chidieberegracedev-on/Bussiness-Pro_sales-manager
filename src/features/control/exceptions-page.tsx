import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldQuestion, CheckCircle2, Info } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { useActivityFeed } from '@/features/control/use-activity'
import { ActivityCard } from '@/features/control/activity-page'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'

/**
 * Exceptions are signals for a person to judge, never accusations and never
 * automated punishment (assessment Part 5.3). The copy here is deliberately
 * neutral: these are things worth a look, with the full context attached.
 */
export function ExceptionsPage() {
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const locale = useLocale()

  const { data: exceptions, isLoading, isError, refetch } = useActivityFeed({ severity: 'exception' })
  const { data: notices } = useActivityFeed({ severity: 'notice' }, 50)

  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const event of exceptions ?? []) {
      map.set(event.action_type, (map.get(event.action_type) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [exceptions])

  return (
    <div>
      <PageHeader
        title="Exceptions to review"
        description="Things the system noticed and thinks a person should look at. Context is included — none of this is a conclusion."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/control/activity')}>
            Full activity log
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/5 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-sm text-text-secondary">
          A flagged item usually has an ordinary explanation — a customer changed their mind, a PIN
          was mistyped, a note was miscounted. Read the detail, ask if it matters, and move on.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && (!exceptions || exceptions.length === 0) && (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs review"
          description="No unusual activity has been flagged. This is the normal state — the panel fills only when something is worth a look."
        />
      )}

      {!isLoading && !isError && exceptions && exceptions.length > 0 && (
        <>
          {grouped.length > 1 && (
            <Card className="mb-4">
              <CardContent className="pt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Patterns
                </p>
                <div className="flex flex-wrap gap-2">
                  {grouped.map(([actionType, count]) => (
                    <span
                      key={actionType}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary"
                    >
                      {actionType.replace(/_/g, ' ')} · <span className="font-semibold">{count}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <ul className="space-y-2">
            {exceptions.map((event) => (
              <ActivityCard
                key={event.id}
                event={event}
                timezone={business?.timezone}
                locale={locale}
              />
            ))}
          </ul>
        </>
      )}

      {/* Approvals aren't exceptions, but an owner usually wants them nearby. */}
      {notices && notices.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex items-center gap-2">
            <ShieldQuestion className="size-4 text-warning" />
            <h2 className="text-sm font-semibold text-text-primary">
              Recent approvals &amp; overrides
            </h2>
          </div>
          <p className="mb-3 text-sm text-text-secondary">
            Actions that needed a manager. Each one records who asked and who approved.
          </p>
          <ul className="space-y-2">
            {notices.slice(0, 10).map((event) => (
              <ActivityCard
                key={event.id}
                event={event}
                timezone={business?.timezone}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

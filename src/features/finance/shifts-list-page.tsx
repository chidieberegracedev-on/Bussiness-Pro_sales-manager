import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Plus, Clock, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { useShifts, useOpenShift } from '@/features/finance/use-shifts'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ShiftsListPage() {
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: location } = useDefaultLocation()
  const { data: openShift } = useOpenShift(location?.id)
  const { data: shifts, isLoading, isError, refetch } = useShifts()

  const totals = useMemo(() => {
    if (!shifts) return { count: 0, variance: new Decimal(0) }
    let variance = new Decimal(0)
    for (const s of shifts) {
      if (s.variance) variance = variance.plus(s.variance)
    }
    return { count: shifts.length, variance }
  }, [shifts])

  return (
    <div>
      <PageHeader
        title="Shifts"
        description="Cash-drawer sessions. Open one at the start, close it blind at the end — the register does the math."
        actions={
          !openShift ? (
            <Button onClick={() => navigate('/shifts/open')}>
              <Plus className="size-4" /> Open shift
            </Button>
          ) : (
            <Button onClick={() => navigate(`/shifts/${openShift.id}/close`)} variant="destructive">
              <CheckCircle2 className="size-4" /> Close open shift
            </Button>
          )
        }
      />

      {openShift && (
        <Card className="mb-4 border-accent-primary/30 bg-accent-primary/5">
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <div className="flex size-11 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <Clock className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">A shift is open</p>
              <p className="text-xs text-text-muted">
                Opened{' '}
                {business ? formatDateTime(openShift.opened_at, business.timezone, locale) : openShift.opened_at} ·
                float <Money value={openShift.opening_float} />
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(`/shifts/${openShift.id}/close`)}>
              Close shift <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <Skeleton className="h-96 w-full rounded-xl" />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && (!shifts || shifts.length === 0) && (
        <EmptyState
          icon={Clock}
          title="No shifts yet"
          description="Open your first shift to start tracking the cash drawer."
          action={
            <Button onClick={() => navigate('/shifts/open')}>
              <Plus className="size-4" /> Open shift
            </Button>
          }
        />
      )}

      {!isLoading && !isError && shifts && shifts.length > 0 && (
        <ul className="space-y-2">
          {shifts.map((s) => {
            const variance = s.variance ? new Decimal(s.variance) : null
            const varianceState = !variance || variance.eq(0) ? 'match' : 'mismatch'
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/shifts/${s.id}/close`)}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-surface-muted',
                    s.status === 'open' && 'border-accent-primary/40',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      s.status === 'open'
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'bg-surface-muted text-text-muted',
                    )}
                  >
                    {s.status === 'open' ? <Clock className="size-5" /> : <CheckCircle2 className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          s.status === 'open'
                            ? 'bg-accent-primary/10 text-accent-primary'
                            : 'bg-surface-muted text-text-muted',
                        )}
                      >
                        {s.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {business ? formatDateTime(s.opened_at, business.timezone, locale) : s.opened_at}
                        {s.closed_at && business && (
                          <> → {formatDateTime(s.closed_at, business.timezone, locale)}</>
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Opened by {s.opened_by_name ?? 'system'} · float <Money value={s.opening_float} />
                    </p>
                  </div>
                  {s.status === 'closed' && (
                    <div className="text-right">
                      <p className="text-sm text-text-secondary">
                        Counted <span className="font-semibold text-text-primary">
                          <Money value={s.counted_cash ?? '0'} />
                        </span>
                      </p>
                      {variance && !variance.eq(0) && (
                        <p
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            variance.gt(0) ? 'text-success' : 'text-danger',
                          )}
                        >
                          {varianceState === 'mismatch' && <AlertTriangle className="size-3" />}
                          {variance.gt(0) ? '+' : ''}
                          <Money value={variance} /> variance
                        </p>
                      )}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {totals.count > 0 && (
        <p className="mt-6 text-center text-xs text-text-muted">
          {totals.count} shift{totals.count === 1 ? '' : 's'} shown · total variance{' '}
          <Money value={totals.variance} />
        </p>
      )}
    </div>
  )
}

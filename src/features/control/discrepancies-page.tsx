import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Scale, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { useShiftDiscrepancies } from '@/features/control/use-activity'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ShiftDiscrepanciesPage() {
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: shifts, isLoading, isError, refetch } = useShiftDiscrepancies()

  const totals = useMemo(() => {
    if (!shifts) return { matched: 0, over: 0, short: 0, net: new Decimal(0) }
    let matched = 0
    let over = 0
    let short = 0
    let net = new Decimal(0)
    for (const shift of shifts) {
      const variance = new Decimal(shift.variance ?? '0')
      net = net.plus(variance)
      if (variance.isZero()) matched++
      else if (variance.gt(0)) over++
      else short++
    }
    return { matched, over, short, net }
  }, [shifts])

  return (
    <div>
      <PageHeader
        title="Shift reconciliation"
        description="Closed shifts, what was counted against what was expected, and the activity behind any gap."
      />

      {!isLoading && !isError && shifts && shifts.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile label="Counted exactly" value={String(totals.matched)} tone="success" />
          <SummaryTile label="Came up over" value={String(totals.over)} tone="info" />
          <SummaryTile label="Came up short" value={String(totals.short)} tone="danger" />
          <SummaryTile
            label="Net difference"
            value={<Money value={totals.net} />}
            tone={totals.net.isZero() ? 'success' : totals.net.gt(0) ? 'info' : 'danger'}
          />
        </div>
      )}

      {isLoading && <Skeleton className="h-96 w-full rounded-xl" />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && (!shifts || shifts.length === 0) && (
        <EmptyState
          icon={Scale}
          title="No closed shifts yet"
          description="Once shifts are closed with a blind count, their reconciliation appears here."
        />
      )}

      {!isLoading && !isError && shifts && shifts.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead>Terminal</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((shift) => {
                    const variance = new Decimal(shift.variance ?? '0')
                    const matched = variance.isZero()
                    const voids = Number(shift.void_count)
                    const overrides = Number(shift.override_count)
                    return (
                      <TableRow
                        key={shift.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/control/activity?shift=${shift.id}`)}
                      >
                        <TableCell className="font-medium text-text-primary">
                          {shift.opened_by_name ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="text-sm text-text-secondary">
                          {shift.closed_at && business
                            ? formatDateTime(shift.closed_at, business.timezone, locale)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-text-secondary">
                          {shift.terminal_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={shift.counted_cash ?? '0'} />
                        </TableCell>
                        <TableCell className="text-right text-text-secondary">
                          <Money value={shift.expected_cash ?? '0'} />
                        </TableCell>
                        <TableCell className="text-right">
                          {matched ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                              <CheckCircle2 className="size-3.5" /> Exact
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-sm font-semibold',
                                variance.gt(0) ? 'text-info' : 'text-danger',
                              )}
                            >
                              {variance.gt(0) ? (
                                <TrendingUp className="size-3.5" />
                              ) : (
                                <TrendingDown className="size-3.5" />
                              )}
                              <Money value={variance.abs()} />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 text-xs">
                            {voids > 0 && (
                              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-text-secondary">
                                {voids} void{voids === 1 ? '' : 's'}
                              </span>
                            )}
                            {overrides > 0 && (
                              <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                                {overrides} approval{overrides === 1 ? '' : 's'}
                              </span>
                            )}
                            {Number(shift.exception_count) > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 font-medium text-danger">
                                <AlertTriangle className="size-3" />
                                {shift.exception_count}
                              </span>
                            )}
                            {voids === 0 && overrides === 0 && Number(shift.exception_count) === 0 && (
                              <span className="text-text-muted">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              A difference is a starting point for a conversation, not a conclusion. Open a shift to
              see exactly what happened during it.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone: 'success' | 'info' | 'danger'
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'info' && 'text-info',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  Users,
  Info,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { ROLE_LABELS } from '@/features/control/roles'
import {
  useEmployeeAnalytics,
  PERIOD_LABELS,
  type AnalyticsPeriod,
  type EmployeeStats,
} from '@/features/control/use-employee-analytics'
import { useLocale } from '@/features/auth/use-locale'
import { cn } from '@/lib/utils'

const PERIODS: AnalyticsPeriod[] = ['today', 'week', 'month', 'quarter']

/**
 * Employee performance — MANAGEMENT ONLY.
 *
 * This screen exists nowhere else on purpose. `/me` shows an employee their own
 * work and nothing to compare it against; the cashier workspace shows the till
 * and nothing else. Ranking people against each other is a management act, so
 * it lives in the management environment behind the management role guard.
 *
 * Everything here is read-derived. No table was added and nothing new is
 * recorded for this page's benefit — it reads the sales, shift, and activity
 * data the business already produces.
 */
export function EmployeePerformancePage() {
  const navigate = useNavigate()
  const locale = useLocale()
  const [period, setPeriod] = useState<AnalyticsPeriod>('week')
  const { data, isLoading, isError, refetch } = useEmployeeAnalytics(period)

  const numberFmt = new Intl.NumberFormat(locale)

  return (
    <div>
      <PageHeader
        eyebrow="Team & Control"
        title="Employee performance"
        description="What each person sold, how their drawer counted, and where they needed approval. Figures, not verdicts — open a row to see the actual events behind it."
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? 'default' : 'outline'}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-96 w-full rounded-2xl" />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="Sales" value={numberFmt.format(data.totals.sale_count)} />
            <SummaryTile label="Revenue" value={<Money value={data.totals.revenue} />} />
            <SummaryTile
              label="Average sale"
              value={<Money value={data.totals.average_sale} />}
            />
            <SummaryTile label="Gross profit" value={<Money value={data.totals.gross_profit} />} />
          </div>

          <AttributionNote
            attributedPct={data.totals.attributed_pct}
            unattributedCount={data.unattributed.sale_count}
            unattributedRevenue={data.unattributed.revenue}
          />

          {data.rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nobody worked this period"
              description="Once an employee opens a shift and rings sales, their figures appear here."
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Average sale</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Shifts</TableHead>
                        <TableHead className="text-right">Drawer</TableHead>
                        <TableHead>Needed review</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row) => (
                        <EmployeeRow
                          key={row.member_id}
                          row={row}
                          numberFmt={numberFmt}
                          onOpen={() =>
                            navigate(`/control/activity?member=${row.member_id}`)
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="type-meta mt-3">
                  A short drawer or an approval request is information, not an accusation. Open the
                  row to read the events in order before drawing a conclusion.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function EmployeeRow({
  row,
  numberFmt,
  onOpen,
}: {
  row: EmployeeStats
  numberFmt: Intl.NumberFormat
  onOpen: () => void
}) {
  const variance = new Decimal(row.cash_variance)
  const flags = row.void_count + row.override_count + row.exception_count

  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell>
        <p className="font-medium text-text-primary">{row.name}</p>
        <p className="type-meta">{row.role ? ROLE_LABELS[row.role] : '—'}</p>
      </TableCell>
      <TableCell className="text-right tabular-nums text-text-primary">
        {numberFmt.format(row.sale_count)}
      </TableCell>
      <TableCell className="text-right font-semibold text-text-primary">
        <Money value={row.revenue} />
      </TableCell>
      <TableCell className="text-right text-text-secondary">
        <Money value={row.average_sale} />
      </TableCell>
      <TableCell className="text-right tabular-nums text-text-secondary">
        {numberFmt.format(row.unit_count)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-text-secondary">
        {numberFmt.format(row.shift_count)}
        {row.hours_worked > 0 && (
          <span className="type-meta ml-1">({numberFmt.format(row.hours_worked)}h)</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {row.shifts_short === 0 && row.shifts_over === 0 ? (
          <span className="type-meta">—</span>
        ) : variance.isZero() ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <CheckCircle2 className="size-3.5" /> Even
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
        {flags === 0 ? (
          <span className="type-meta">Clean</span>
        ) : (
          <div className="flex flex-wrap gap-1 text-xs">
            {row.void_count > 0 && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-text-secondary">
                {row.void_count} void{row.void_count === 1 ? '' : 's'}
              </span>
            )}
            {row.override_count > 0 && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                {row.override_count} approval{row.override_count === 1 ? '' : 's'}
              </span>
            )}
            {row.exception_count > 0 && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 font-medium text-danger">
                {row.exception_count} to review
              </span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <ChevronRight className="size-4 text-icon-muted" />
      </TableCell>
    </TableRow>
  )
}

/**
 * Says out loud how these numbers were attributed and what share of sales the
 * attribution actually covers. A performance table that quietly drops the sales
 * it could not place is worse than no table: someone gets judged on a subset
 * nobody mentioned.
 */
function AttributionNote({
  attributedPct,
  unattributedCount,
  unattributedRevenue,
}: {
  attributedPct: number
  unattributedCount: number
  unattributedRevenue: string
}) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border bg-tint-info px-4 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-tint-info-foreground" />
      <div className="min-w-0 text-sm text-tint-info-foreground">
        <p>
          Sales are attributed to whoever opened the shift they were rung on — that is the identity
          the till records when a cashier signs in with their PIN.
        </p>
        {unattributedCount > 0 && (
          <p className="mt-1.5">
            <strong className="font-semibold">
              {unattributedCount} sale{unattributedCount === 1 ? '' : 's'}
            </strong>{' '}
            (<Money value={unattributedRevenue} />) could not be attributed — rung with no shift
            open, or before employee sign-in was switched on. They are counted in the totals above
            but appear against nobody. {attributedPct}% of sales are attributed.
          </p>
        )}
      </div>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-e1">
      <p className="type-meta">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{value}</p>
    </div>
  )
}


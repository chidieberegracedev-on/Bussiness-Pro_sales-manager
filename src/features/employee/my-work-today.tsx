import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Decimal from 'decimal.js'
import { AlertTriangle, ArrowRight, Clock, Receipt, ShoppingCart, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBadge, NotePanel } from '@/components/ui/icon-badge'
import { Money } from '@/components/money/money'
import { useMySales, useMyShifts, summariseSales } from '@/features/employee/use-my-work'
import { useDefaultLocation, useActiveBusiness } from '@/features/business/hooks'
import { useOpenShift } from '@/features/finance/use-shifts'
import { useShiftCashSummary } from '@/features/control/use-shift-summary'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime, formatRelativeTime } from '@/lib/format'

/**
 * "Where am I today."
 *
 * The four numbers an operator is actually accountable for — am I on shift,
 * what have I sold, what is in my drawer, and is anything outstanding against
 * me. Everything else on this workspace is detail behind one of them.
 */
export function MyWorkTodayPage() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const timezone = business?.timezone ?? 'UTC'

  const { data: location } = useDefaultLocation()
  const { data: openShift, isLoading: shiftLoading } = useOpenShift(location?.id)
  const cash = useShiftCashSummary(openShift?.id)
  const { data: sales, isLoading: salesLoading } = useMySales(7)
  const { data: shifts } = useMyShifts(10)

  const totals = useMemo(
    () => summariseSales(sales ?? [], timezone),
    [sales, timezone],
  )

  // A closed shift whose count didn't match is the one thing on this screen a
  // person may need to explain to a manager, so it is surfaced rather than
  // left for them to discover in a meeting.
  const discrepancies = useMemo(
    () =>
      (shifts ?? []).filter(
        (s) => s.variance !== null && !new Decimal(s.variance).eq(0),
      ),
    [shifts],
  )

  const drawerCash = cash.data?.drawerCash ?? new Decimal(openShift?.opening_float ?? '0')

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="type-display">Today</h1>
      <p className="type-body mt-1.5">
        Your own shift, sales and drawer. Nobody else's.
      </p>

      {/* Shift state, first, because everything else depends on it. */}
      <div className="mt-6 rounded-2xl bg-surface p-5 shadow-e2">
        {shiftLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : openShift ? (
          <div className="flex flex-wrap items-center gap-4">
            <IconBadge tone="success" size="xl">
              <Clock />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-title">On shift</p>
                <Badge variant="success">Open</Badge>
              </div>
              <p className="type-meta mt-0.5">
                Since {formatDateTime(openShift.opened_at, timezone, locale)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="type-meta">Expected in drawer</p>
              <p className="text-xl font-bold tabular-nums text-text-primary">
                <Money value={drawerCash} />
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <IconBadge tone="neutral" size="xl">
              <Clock />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <p className="type-title">Not on shift</p>
              <p className="type-meta mt-0.5">
                Open one from the till when you start serving.
              </p>
            </div>
            <Button variant="outline" asChild className="shrink-0">
              <Link to="/pos">
                Go to the till <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {salesLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))
        ) : (
          <>
            <Metric
              icon={ShoppingCart}
              label="Sales today"
              value={String(totals.todayCount)}
            />
            <Metric
              icon={Wallet}
              label="Taken today"
              value={<Money value={totals.todayValue} />}
            />
            <Metric
              icon={Receipt}
              label="Average sale"
              value={<Money value={totals.averageSale} />}
              hint="Last 7 days"
            />
            <Metric
              icon={AlertTriangle}
              label="Voided"
              value={String(totals.voidedCount)}
              hint="Last 7 days"
              tone={totals.voidedCount > 0 ? 'warning' : 'neutral'}
            />
          </>
        )}
      </div>

      {discrepancies.length > 0 && (
        <NotePanel tone="warning" className="mt-4">
          <p className="type-heading">
            {discrepancies.length} shift{discrepancies.length === 1 ? '' : 's'} closed with a cash
            difference
          </p>
          <p className="type-body mt-1 text-tint-warning-foreground/90">
            A difference isn't an accusation — it is a number to explain. Open the shift to see the
            count against what was expected.
          </p>
          <Button variant="outline" size="sm" className="mt-3 bg-surface" asChild>
            <Link to="/me/shifts">Review my shifts</Link>
          </Button>
        </NotePanel>
      )}

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="type-title">Recent sales</h2>
        <Link
          to="/me/sales"
          className="text-[0.8125rem] font-semibold text-accent-primary hover:underline"
        >
          See all
        </Link>
      </div>

      {salesLoading && <Skeleton className="mt-3 h-32 w-full rounded-2xl" />}

      {!salesLoading && (sales ?? []).length === 0 && (
        <p className="type-body mt-3 rounded-2xl bg-surface p-6 text-center shadow-e2">
          Nothing yet. Sales you ring up appear here.
        </p>
      )}

      {!salesLoading && (sales ?? []).length > 0 && (
        <ul className="mt-3 space-y-2">
          {(sales ?? []).slice(0, 6).map((sale) => (
            <li key={sale.id}>
              <Link
                to={`/sales/${sale.id}`}
                className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-4 shadow-e1 transition-shadow hover:shadow-e2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {sale.sale_number}
                  </p>
                  <p className="type-meta truncate">
                    {sale.item_count} item{sale.item_count === '1' ? '' : 's'} ·{' '}
                    {formatRelativeTime(sale.completed_at, locale)}
                  </p>
                </div>
                {sale.status !== 'completed' && <Badge variant="danger">Voided</Badge>}
                <span className="shrink-0 font-bold tabular-nums text-text-primary">
                  <Money value={sale.grand_total} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'accent',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'accent' | 'warning' | 'neutral'
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-4 shadow-e1">
      <IconBadge tone={tone} size="md">
        <Icon />
      </IconBadge>
      <p className="mt-2.5 truncate text-xl font-bold tabular-nums text-text-primary">{value}</p>
      <p className="type-meta truncate">{label}</p>
      {hint && <p className="type-meta text-text-disabled">{hint}</p>}
    </div>
  )
}

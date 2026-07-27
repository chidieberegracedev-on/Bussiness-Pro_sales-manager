import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign,
  Receipt,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import Decimal from 'decimal.js'
import { useDashboardSummary, useSalesTimeseries, useRecentSales, useLowStockItems } from '@/features/analytics/use-dashboard'
import { StatCard } from '@/features/analytics/stat-card'
import { RevenueChart } from '@/features/analytics/revenue-chart'
import { SaleStatusBadge } from '@/features/sales/sale-status-badge'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { businessDayStartUtc } from '@/lib/format'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { StockStatusBadge } from '@/components/data/stock-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Period = 'today' | 'week' | 'month'

function usePeriodRange(period: Period, timezone: string | undefined) {
  return useMemo(() => {
    if (!timezone) return { from: '', to: '' }
    const now = new Date()
    if (period === 'today') {
      const from = businessDayStartUtc(now, timezone)
      const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
      return { from, to }
    }
    if (period === 'week') {
      const localParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).formatToParts(now)
      const weekdayStr = localParts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
      const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
      const daysFromMonday = dayMap[weekdayStr] ?? 0
      const mondayMs = Date.now() - daysFromMonday * 86_400_000
      const from = businessDayStartUtc(new Date(mondayMs), timezone)
      const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
      return { from, to }
    }
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' })
      .formatToParts(now)
    const y = parts.find((p) => p.type === 'year')!.value
    const m = parts.find((p) => p.type === 'month')!.value
    const from = businessDayStartUtc(new Date(`${y}-${m}-01T12:00:00Z`), timezone)
    const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
    return { from, to }
  }, [period, timezone])
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="mb-2 h-8 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="mb-4 h-5 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const navigate = useNavigate()
  const canSeeProfit = role === 'owner' || role === 'manager'

  const [period, setPeriod] = useState<Period>('today')
  const { data: summary, isLoading, isError } = useDashboardSummary()

  const range = usePeriodRange(period, business?.timezone)
  const bucket = period === 'today' ? 'hour' : 'day'
  const { data: timeseries } = useSalesTimeseries(range.from, range.to, bucket as 'hour' | 'day')
  const { data: recentSales } = useRecentSales()
  const { data: lowStockItems } = useLowStockItems()

  const outOfStock = useMemo(
    () => (lowStockItems ?? []).filter((i) => i.stock_status === 'out_of_stock'),
    [lowStockItems],
  )
  const lowStock = useMemo(
    () => (lowStockItems ?? []).filter((i) => i.stock_status === 'low'),
    [lowStockItems],
  )

  if (isLoading) return <DashboardSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-text-secondary">Couldn't load the dashboard. Please try again.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  const p = period === 'today' ? summary?.today : period === 'week' ? summary?.week : summary?.month
  const rev = p?.revenue ?? '0'
  const txn = p?.transactions ?? 0
  const aov = period === 'today' ? (summary?.today.avg_transaction ?? '0') : (
    txn > 0 ? new Decimal(rev).div(txn).toFixed(4) : '0'
  )
  const profit = p && 'gross_profit' in p ? (p.gross_profit ?? '0') : '0'

  const periodLabels: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month' }
  const deltaLabel = period === 'today' ? 'vs yesterday' : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Dashboard</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Performance overview for {business?.name}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
          {(['today', 'week', 'month'] as Period[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                period === key
                  ? 'bg-card text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {periodLabels[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Pulse KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={<Money value={rev} />}
          icon={DollarSign}
          iconColor="text-success bg-success/10"
          currentValue={period === 'today' ? summary?.today.revenue : undefined}
          previousValue={period === 'today' ? summary?.yesterday.revenue : undefined}
          deltaLabel={deltaLabel}
        />
        <StatCard
          label="Transactions"
          value={txn}
          icon={Receipt}
          iconColor="text-accent-primary bg-accent-primary/10"
          currentValue={period === 'today' ? summary?.today.transactions : undefined}
          previousValue={period === 'today' ? summary?.yesterday.transactions : undefined}
          deltaLabel={deltaLabel}
        />
        <StatCard
          label="Avg Transaction"
          value={<Money value={aov} />}
          icon={BarChart3}
          iconColor="text-accent-secondary bg-accent-secondary/10"
        />
        {canSeeProfit && (
          <StatCard
            label="Gross Profit"
            value={<Money value={profit} />}
            icon={TrendingUp}
            iconColor="text-accent-tertiary bg-accent-tertiary/10"
          />
        )}
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Revenue Overview</CardTitle>
          <span className="text-xs text-text-muted">
            {period === 'today' ? 'Hourly' : 'Daily'} · {periodLabels[period]}
          </span>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            {timeseries ? (
              <RevenueChart data={timeseries} bucket={bucket as 'hour' | 'day'} />
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom row: attention + recent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Needs attention */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" />
              Needs Attention
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/low-stock')}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {outOfStock.length === 0 && lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                All stock levels are healthy
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {outOfStock.slice(0, 4).map((item) => (
                  <li key={item.variant_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="truncate text-xs text-text-muted">{item.variant_name}</p>
                      )}
                    </div>
                    <StockStatusBadge status="out_of_stock" />
                  </li>
                ))}
                {lowStock.slice(0, 4).map((item) => (
                  <li key={item.variant_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="truncate text-xs text-text-muted">{item.variant_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-text-muted">
                        <Quantity value={item.qty_on_hand} />
                      </span>
                      <StockStatusBadge status="low" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-text-muted" />
              Recent Transactions
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/sales')}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {!recentSales || recentSales.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                No sales yet. Completed sales will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentSales.slice(0, 6).map((sale) => (
                  <li key={sale.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-muted/50"
                      onClick={() => navigate(`/sales/${sale.id}`)}
                    >
                      <div className="flex size-8 items-center justify-center rounded-lg bg-accent-primary/10 text-xs font-bold text-accent-primary">
                        #{sale.sale_number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary">
                          <Money value={sale.grand_total} />
                        </p>
                        <p className="text-xs text-text-muted">
                          {business
                            ? formatDateTime(sale.completed_at, business.timezone, locale)
                            : sale.completed_at}
                          {sale.sold_by_name && ` · ${sale.sold_by_name}`}
                        </p>
                      </div>
                      <SaleStatusBadge status={sale.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

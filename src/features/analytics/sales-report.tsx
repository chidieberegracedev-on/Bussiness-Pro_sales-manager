import { useMemo, useState } from 'react'
import { DollarSign, Receipt, BarChart3, ShoppingBag, TrendingUp } from 'lucide-react'
import { useSalesReport } from '@/features/analytics/use-sales-report'
import { useSalesTimeseries } from '@/features/analytics/use-dashboard'
import { useSalesList } from '@/features/sales/use-sales-list'
import { StatCard } from '@/features/analytics/stat-card'
import { RevenueChart } from '@/features/analytics/revenue-chart'
import { PaymentBreakdownChart } from '@/features/analytics/payment-breakdown-chart'
import { SalesTable } from '@/features/sales/sales-table'
import { useActiveBusiness } from '@/features/business/hooks'
import { businessDayStartUtc } from '@/lib/format'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/data/pagination'
import { EmptyState } from '@/components/data/empty-state'
import { cn } from '@/lib/utils'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This Week',
  month: 'This Month',
  custom: 'Custom',
}

function usePresetRange(preset: Preset, customFrom: string, customTo: string, timezone: string | undefined) {
  return useMemo(() => {
    if (!timezone) return { from: '', to: '' }
    const now = new Date()

    if (preset === 'custom' && customFrom && customTo) {
      const from = businessDayStartUtc(new Date(`${customFrom}T12:00:00Z`), timezone)
      const to = businessDayStartUtc(new Date(new Date(`${customTo}T12:00:00Z`).getTime() + 86_400_000), timezone)
      return { from, to }
    }

    if (preset === 'today') {
      const from = businessDayStartUtc(now, timezone)
      const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
      return { from, to }
    }
    if (preset === 'yesterday') {
      const yesterday = new Date(Date.now() - 86_400_000)
      const from = businessDayStartUtc(yesterday, timezone)
      const to = businessDayStartUtc(now, timezone)
      return { from, to }
    }
    if (preset === 'week') {
      const localParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).formatToParts(now)
      const weekdayStr = localParts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
      const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
      const daysFromMonday = dayMap[weekdayStr] ?? 0
      const mondayMs = Date.now() - daysFromMonday * 86_400_000
      const from = businessDayStartUtc(new Date(mondayMs), timezone)
      const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
      return { from, to }
    }
    // month
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' })
      .formatToParts(now)
    const y = parts.find((p) => p.type === 'year')!.value
    const m = parts.find((p) => p.type === 'month')!.value
    const from = businessDayStartUtc(new Date(`${y}-${m}-01T12:00:00Z`), timezone)
    const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
    return { from, to }
  }, [preset, customFrom, customTo, timezone])
}

const PAGE_SIZE = 20

export function SalesReportPage() {
  const { business, role } = useActiveBusiness()
  const canSeeProfit = role === 'owner' || role === 'manager'

  const [preset, setPreset] = useState<Preset>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)

  const range = usePresetRange(preset, customFrom, customTo, business?.timezone)
  const bucket = preset === 'today' || preset === 'yesterday' ? 'hour' : 'day'

  const { data: report, isLoading } = useSalesReport(range.from, range.to)
  const { data: timeseries } = useSalesTimeseries(range.from, range.to, bucket as 'hour' | 'day')
  const { data: salesData } = useSalesList({ from: range.from, to: range.to }, page, PAGE_SIZE)

  const pageCount = salesData ? Math.max(1, Math.ceil(salesData.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Sales Report</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Revenue, transactions, and payment analytics</p>
        </div>
      </div>

      {/* Range control */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
            {(['today', 'yesterday', 'week', 'month', 'custom'] as Preset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { setPreset(key); setPage(1) }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                  preset === key
                    ? 'bg-card text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="text-xs font-medium text-text-secondary">From</label>
                <Input type="date" className="mt-1" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }} />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">To</label>
                <Input type="date" className="mt-1" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1) }} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <Skeleton className="mb-3 h-4 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      ) : report ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Revenue" value={<Money value={report.total_revenue} />} icon={DollarSign} iconColor="text-success bg-success/10" />
          <StatCard label="Transactions" value={report.transaction_count} icon={Receipt} iconColor="text-accent-primary bg-accent-primary/10" />
          <StatCard label="Avg Transaction" value={<Money value={report.avg_transaction} />} icon={BarChart3} iconColor="text-accent-secondary bg-accent-secondary/10" />
          <StatCard label="Units Sold" value={<Quantity value={report.units_sold} />} icon={ShoppingBag} iconColor="text-info bg-info/10" />
          {canSeeProfit && (
            <StatCard label="Gross Profit" value={<Money value={report.gross_profit} />} icon={TrendingUp} iconColor="text-accent-tertiary bg-accent-tertiary/10" />
          )}
        </div>
      ) : null}

      {/* Chart + Payment breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {timeseries ? (
                <RevenueChart data={timeseries} bucket={bucket as 'hour' | 'day'} />
              ) : (
                <Skeleton className="h-full w-full" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {report?.payment_breakdown ? (
              <PaymentBreakdownChart data={report.payment_breakdown} />
            ) : (
              <Skeleton className="h-48 w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {salesData && salesData.rows.length > 0 ? (
            <>
              <SalesTable rows={salesData.rows} showGrossProfit={canSeeProfit} />
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={salesData.total} pageSize={PAGE_SIZE} />
            </>
          ) : salesData && salesData.rows.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions" description="No completed sales in this period." />
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

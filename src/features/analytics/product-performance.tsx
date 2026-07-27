import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Package, TrendingDown } from 'lucide-react'
import Decimal from 'decimal.js'
import { useProductPerformance, type ProductPerformanceRow } from '@/features/analytics/use-product-performance'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { businessDayStartUtc, formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'
import { cn } from '@/lib/utils'

type Preset = 'today' | 'week' | 'month' | 'custom'
type SortKey = 'units' | 'revenue' | 'profit'

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  custom: 'Custom',
}

const BAR_COLORS = [
  'hsl(var(--accent-primary))',
  'hsl(var(--accent-secondary))',
  'hsl(var(--accent-tertiary))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
]

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
    if (preset === 'week') {
      const localParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).formatToParts(now)
      const weekdayStr = localParts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
      const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
      const daysFromMonday = dayMap[weekdayStr] ?? 0
      const from = businessDayStartUtc(new Date(Date.now() - daysFromMonday * 86_400_000), timezone)
      const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
      return { from, to }
    }
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(now)
    const y = parts.find((p) => p.type === 'year')!.value
    const m = parts.find((p) => p.type === 'month')!.value
    const from = businessDayStartUtc(new Date(`${y}-${m}-01T12:00:00Z`), timezone)
    const to = businessDayStartUtc(new Date(Date.now() + 86_400_000), timezone)
    return { from, to }
  }, [preset, customFrom, customTo, timezone])
}

function sortProducts(rows: ProductPerformanceRow[], sort: SortKey): ProductPerformanceRow[] {
  return [...rows].sort((a, b) => {
    if (sort === 'units') return new Decimal(b.units_sold).minus(a.units_sold).toNumber()
    if (sort === 'revenue') return new Decimal(b.revenue).minus(a.revenue).toNumber()
    const ap = a.gross_profit ? new Decimal(a.gross_profit) : new Decimal(0)
    const bp = b.gross_profit ? new Decimal(b.gross_profit) : new Decimal(0)
    return bp.minus(ap).toNumber()
  })
}

export function ProductPerformancePage() {
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const canSeeProfit = role === 'owner' || role === 'manager'

  const [preset, setPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [sort, setSort] = useState<SortKey>('revenue')

  const range = usePresetRange(preset, customFrom, customTo, business?.timezone)
  const { data: products, isLoading } = useProductPerformance(range.from, range.to)

  const sorted = useMemo(() => (products ? sortProducts(products, sort) : []), [products, sort])
  const topSellers = useMemo(() => sorted.filter((p) => new Decimal(p.units_sold).gt(0)).slice(0, 5), [sorted])
  const noActivity = useMemo(() => sorted.filter((p) => new Decimal(p.units_sold).eq(0)), [sorted])
  const active = useMemo(() => sorted.filter((p) => new Decimal(p.units_sold).gt(0)), [sorted])

  const topChartData = useMemo(
    () =>
      topSellers.map((p) => ({
        name: p.product_name.length > 18 ? p.product_name.slice(0, 16) + '…' : p.product_name,
        value:
          sort === 'units'
            ? new Decimal(p.units_sold).toNumber()
            : sort === 'revenue'
              ? new Decimal(p.revenue).toNumber()
              : new Decimal(p.gross_profit ?? 0).toNumber(),
      })),
    [topSellers, sort],
  )

  function fmtMoney(v: number) {
    if (!business) return String(v)
    return formatMoney(v, business.currency_code, business.currency_exponent, locale)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Product Performance</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Sales ranking and slow-mover analysis
        </p>
      </div>

      {/* Range control */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
            {(['today', 'week', 'month', 'custom'] as Preset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                  preset === key
                    ? 'bg-card text-text-primary shadow-sm'
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
                <Input type="date" className="mt-1" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">To</label>
                <Input type="date" className="mt-1" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Top-N visual */}
          {topChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Top {topChartData.length} by {sort === 'units' ? 'Units Sold' : sort === 'revenue' ? 'Revenue' : 'Gross Profit'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topChartData} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={sort !== 'units' ? fmtMoney : undefined}
                        tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
                        axisLine={false}
                        tickLine={false}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--surface-elevated))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.5rem',
                          fontSize: '0.8125rem',
                        }}
                        formatter={(value) => [
                          sort !== 'units' ? fmtMoney(Number(value)) : String(value),
                          sort === 'units' ? 'Units' : sort === 'revenue' ? 'Revenue' : 'Profit',
                        ]}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                        {topChartData.map((_, i) => (
                          <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ranking table */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">All Products</CardTitle>
              <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5 text-xs">
                {(['revenue', 'units', ...(canSeeProfit ? ['profit'] : [])] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={cn(
                      'rounded px-2.5 py-1 font-medium transition-all capitalize',
                      sort === key
                        ? 'bg-card text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {active.length === 0 ? (
                <EmptyState icon={Package} title="No product sales" description="No products were sold in this period." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Units Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                      {canSeeProfit && <TableHead>Gross Profit</TableHead>}
                      <TableHead>Last Sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.map((p, i) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="text-text-muted">{i + 1}</TableCell>
                        <TableCell className="font-medium text-text-primary">{p.product_name}</TableCell>
                        <TableCell><Quantity value={p.units_sold} /></TableCell>
                        <TableCell><Money value={p.revenue} /></TableCell>
                        {canSeeProfit && (
                          <TableCell className="text-text-secondary">
                            {p.gross_profit ? <Money value={p.gross_profit} /> : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-text-secondary">
                          {p.last_sold_at && business
                            ? formatDate(p.last_sold_at, business.timezone, locale)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Slow / no movement */}
          {noActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingDown className="size-4 text-warning" />
                  No Movement ({noActivity.length} product{noActivity.length === 1 ? '' : 's'})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {noActivity.map((p) => (
                    <li key={p.product_id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-medium text-text-primary">{p.product_name}</span>
                      <span className="text-text-muted">0 units sold</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

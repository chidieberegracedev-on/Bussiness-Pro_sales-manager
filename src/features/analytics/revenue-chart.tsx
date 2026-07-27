import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Decimal from 'decimal.js'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatMoney } from '@/lib/money'
import type { TimeseriesPoint } from '@/features/analytics/use-dashboard'

interface RevenueChartProps {
  data: TimeseriesPoint[]
  bucket: 'hour' | 'day'
}

export function RevenueChart({ data, bucket }: RevenueChartProps) {
  const { business } = useActiveBusiness()
  const locale = useLocale()

  const chartData = useMemo(
    () =>
      data.map((p) => ({
        time: p.bucket_start,
        revenue: new Decimal(p.revenue).toNumber(),
        transactions: p.transactions,
      })),
    [data],
  )

  function formatAxisTime(iso: string) {
    if (!business) return iso
    const date = new Date(iso)
    if (bucket === 'hour') {
      return new Intl.DateTimeFormat(locale, {
        timeZone: business.timezone,
        hour: 'numeric',
        hour12: true,
      }).format(date)
    }
    return new Intl.DateTimeFormat(locale, {
      timeZone: business.timezone,
      weekday: 'short',
      day: 'numeric',
    }).format(date)
  }

  function formatTooltipMoney(val: number) {
    if (!business) return String(val)
    return formatMoney(val, business.currency_code, business.currency_exponent, locale)
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        No sales data for this period
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent-primary))" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(var(--accent-primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={formatAxisTime}
          tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tickFormatter={(v) => formatTooltipMoney(v)}
          tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
          axisLine={false}
          tickLine={false}
          dx={-4}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--surface-elevated))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)',
            fontSize: '0.8125rem',
          }}
          labelFormatter={(label) => formatAxisTime(String(label))}
          formatter={(value, name) => [
            formatTooltipMoney(Number(value)),
            name === 'revenue' ? 'Revenue' : String(name),
          ]}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="hsl(var(--accent-primary))"
          strokeWidth={2.5}
          fill="url(#revenueGradient)"
          dot={false}
          activeDot={{ r: 5, fill: 'hsl(var(--accent-primary))', stroke: 'hsl(var(--surface))', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

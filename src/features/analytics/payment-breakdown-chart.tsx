import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Decimal from 'decimal.js'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatMoney } from '@/lib/money'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  other: 'Other',
}

const BAR_COLORS = [
  'hsl(var(--accent-primary))',
  'hsl(var(--accent-secondary))',
  'hsl(var(--accent-tertiary))',
  'hsl(var(--warning))',
]

interface Props {
  data: { method: string; amount: string; count: number }[]
}

export function PaymentBreakdownChart({ data }: Props) {
  const { business } = useActiveBusiness()
  const locale = useLocale()

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        method: METHOD_LABELS[d.method] ?? d.method,
        amount: new Decimal(d.amount).toNumber(),
        count: d.count,
      })),
    [data],
  )

  if (chartData.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">No payment data for this period</p>
  }

  function fmt(v: number) {
    if (!business) return String(v)
    return formatMoney(v, business.currency_code, business.currency_exponent, locale)
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 48)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          type="number"
          tickFormatter={fmt}
          tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="method"
          tick={{ fontSize: 13, fill: 'hsl(var(--text-primary))' }}
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
          formatter={(value) => [fmt(Number(value)), 'Amount']}
        />
        <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={28}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

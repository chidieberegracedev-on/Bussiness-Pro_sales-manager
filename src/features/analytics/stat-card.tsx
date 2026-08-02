import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import Decimal from 'decimal.js'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: ReactNode
  value: ReactNode
  icon: LucideIcon
  iconColor?: string
  previousValue?: string | number | null
  currentValue?: string | number | null
  deltaLabel?: string
  className?: string
}

function computeDelta(current: string | number | null | undefined, previous: string | number | null | undefined) {
  if (current == null || previous == null) return null
  const c = new Decimal(current)
  const p = new Decimal(previous)
  if (p.isZero()) return c.isZero() ? null : { pct: 100, direction: 'up' as const }
  const pct = c.minus(p).div(p).times(100).toDecimalPlaces(1).toNumber()
  return { pct: Math.abs(pct), direction: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('flat' as const) }
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'text-accent-primary bg-accent-primary/10',
  previousValue,
  currentValue,
  deltaLabel,
  className,
}: StatCardProps) {
  const delta = computeDelta(currentValue, previousValue)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-border-strong',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <div className={cn('flex size-9 items-center justify-center rounded-lg', iconColor)}>
          <Icon className="size-4.5" />
        </div>
      </div>

      <div className="text-2xl font-bold tracking-tight text-text-primary">{value}</div>

      {delta && (
        <div className="flex items-center gap-1.5 text-xs">
          {delta.direction === 'up' && (
            <>
              <div className="flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 font-medium text-success">
                <TrendingUp className="size-3" />
                +{delta.pct}%
              </div>
            </>
          )}
          {delta.direction === 'down' && (
            <>
              <div className="flex items-center gap-0.5 rounded-full bg-danger/10 px-1.5 py-0.5 font-medium text-danger">
                <TrendingDown className="size-3" />
                -{delta.pct}%
              </div>
            </>
          )}
          {delta.direction === 'flat' && (
            <div className="flex items-center gap-0.5 rounded-full bg-surface-muted px-1.5 py-0.5 font-medium text-text-muted">
              <Minus className="size-3" />
              0%
            </div>
          )}
          {deltaLabel && <span className="text-text-muted">{deltaLabel}</span>}
        </div>
      )}
    </div>
  )
}

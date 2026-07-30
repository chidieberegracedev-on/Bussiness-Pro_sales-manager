import { useNavigate } from 'react-router-dom'
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Package,
  Receipt,
  Wallet,
  Percent,
  ChevronRight,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useInsights, type Insight } from '@/features/help/use-insights'
import type { InsightCategory } from '@/types/database'
import { cn } from '@/lib/utils'

const CATEGORY_META: Record<
  InsightCategory,
  { icon: typeof Lightbulb; route?: string; routeLabel?: string }
> = {
  sales: { icon: TrendingUp, route: '/reports/sales', routeLabel: 'Sales report' },
  margin: { icon: Percent, route: '/reports/products', routeLabel: 'Product performance' },
  stock: { icon: Package, route: '/inventory/low-stock', routeLabel: 'Low stock' },
  expenses: { icon: Receipt, route: '/expenses', routeLabel: 'Expenses' },
  cash: { icon: Wallet, route: '/restock', routeLabel: 'Restock' },
}

/**
 * A calm strip of contextual coaching cards. Never a broken panel: while
 * loading it shows nothing, and with no insights it stays silent apart from a
 * gentle note (WEB_IMPLEMENTATION §5).
 */
export function InsightsStrip() {
  const navigate = useNavigate()
  const { data: insights, isLoading, isError } = useInsights()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  // A failing insights query must never break the dashboard — insights are
  // advisory, so we simply omit the strip.
  if (isError) return null

  if (!insights || insights.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3">
        <Lightbulb className="size-4 shrink-0 text-text-muted" />
        <p className="text-sm text-text-muted">
          Insights will appear here as you trade — sales patterns, margins, stock runway, and cash.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb className="size-4 text-warning" />
        <h2 className="text-sm font-semibold text-text-primary">Insights</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight, index) => (
          <InsightCard
            key={`${insight.category}-${index}`}
            insight={insight}
            onOpen={(route) => navigate(route)}
          />
        ))}
      </div>
    </div>
  )
}

function InsightCard({
  insight,
  onOpen,
}: {
  insight: Insight
  onOpen: (route: string) => void
}) {
  const meta = CATEGORY_META[insight.category] ?? { icon: Lightbulb }
  const Icon = insight.type === 'attention' ? AlertTriangle : meta.icon
  const positive = insight.type === 'positive'
  const clickable = !!meta.route

  const content = (
    <>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          positive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
        )}
      >
        <Icon className="size-4" />
      </div>
      <p className="flex-1 text-sm leading-snug text-text-primary">{insight.text}</p>
      {clickable && <ChevronRight className="size-4 shrink-0 self-center text-text-muted" />}
    </>
  )

  const baseClass = cn(
    'flex items-start gap-3 rounded-xl border p-3.5 text-left',
    positive ? 'border-success/25 bg-success/5' : 'border-warning/25 bg-warning/5',
  )

  if (!clickable) {
    return <div className={baseClass}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(meta.route!)}
      aria-label={`${insight.text} — open ${meta.routeLabel}`}
      className={cn(baseClass, 'transition-shadow hover:shadow-md')}
    >
      {content}
    </button>
  )
}

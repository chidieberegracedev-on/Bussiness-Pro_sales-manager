import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import { useMySales, summariseSales } from '@/features/employee/use-my-work'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const

/** Every sale this person rang up, with the totals derived from the same rows. */
export function MySalesPage() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const timezone = business?.timezone ?? 'UTC'
  const [days, setDays] = useState<number>(7)

  const { data: sales, isLoading } = useMySales(days)
  const totals = useMemo(() => summariseSales(sales ?? [], timezone), [sales, timezone])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="type-display">My sales</h1>
      <p className="type-body mt-1.5">Transactions recorded against you.</p>

      <div className="mt-5 flex gap-2">
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            onClick={() => setDays(range.days)}
            aria-pressed={days === range.days}
            className={cn(
              'min-h-10 rounded-full px-4 text-sm font-semibold transition-colors',
              days === range.days
                ? 'bg-text-primary text-background'
                : 'bg-surface text-text-secondary shadow-e1 hover:text-text-primary',
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Total label="Sales" value={String(totals.rangeCount)} />
        <Total label="Value" value={<Money value={totals.rangeValue} />} />
        <Total label="Average" value={<Money value={totals.averageSale} />} />
      </div>

      {isLoading && (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && (sales ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={Receipt}
            title="Nothing in this range"
            description="Sales you complete at the till appear here straight away."
          />
        </div>
      )}

      {!isLoading && (sales ?? []).length > 0 && (
        <ul className="mt-6 space-y-2">
          {(sales ?? []).map((sale) => (
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
                    {formatDateTime(sale.completed_at, timezone, locale)} · {sale.item_count} item
                    {sale.item_count === '1' ? '' : 's'}
                  </p>
                </div>
                {sale.status !== 'completed' && <Badge variant="danger">Voided</Badge>}
                <span
                  className={cn(
                    'shrink-0 font-bold tabular-nums',
                    sale.status === 'completed'
                      ? 'text-text-primary'
                      : 'text-text-disabled line-through',
                  )}
                >
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

function Total({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-4 shadow-e1">
      <p className="type-meta">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums text-text-primary">{value}</p>
    </div>
  )
}

import Decimal from 'decimal.js'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import { useMyShifts, type ShiftRow } from '@/features/employee/use-my-work'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Every shift this person has opened, and how each one closed. */
export function MyShiftsPage() {
  const { business } = useActiveBusiness()
  const { data: shifts, isLoading } = useMyShifts(30)
  const timezone = business?.timezone ?? 'UTC'
  const locale = useLocale()

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="type-display">My shifts</h1>
      <p className="type-body mt-1.5">
        Each drawer you opened and how the count came out.
      </p>

      {isLoading && (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && (shifts ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={Clock}
            title="No shifts yet"
            description="Shifts you open at the till appear here, with the closing count."
          />
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {(shifts ?? []).map((shift) => (
          <li key={shift.id}>
            <ShiftCard shift={shift} timezone={timezone} locale={locale} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ShiftCard({
  shift,
  timezone,
  locale,
}: {
  shift: ShiftRow
  timezone: string
  locale: string
}) {
  const open = shift.status === 'open'
  const variance = shift.variance === null ? null : new Decimal(shift.variance)
  const matched = variance !== null && variance.eq(0)

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-heading">
              {formatDateTime(shift.opened_at, timezone, locale)}
            </p>
            {open ? (
              <Badge variant="success">Open now</Badge>
            ) : matched ? (
              <Badge variant="success">Balanced</Badge>
            ) : variance !== null ? (
              <Badge variant={variance.lt(0) ? 'danger' : 'warning'}>
                {variance.lt(0) ? 'Short' : 'Over'}
              </Badge>
            ) : (
              <Badge variant="muted">Closed</Badge>
            )}
          </div>
          <p className="type-meta mt-0.5">
            {shift.closed_at
              ? `Closed ${formatDateTime(shift.closed_at, timezone, locale)}`
              : 'Still open'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="type-meta">Opening float</p>
          <p className="font-semibold tabular-nums text-text-primary">
            <Money value={shift.opening_float} />
          </p>
        </div>
      </div>

      {!open && shift.counted_cash !== null && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Cell label="Expected" value={<Money value={shift.expected_cash ?? '0'} />} />
          <Cell label="Counted" value={<Money value={shift.counted_cash} />} />
          <Cell
            label="Difference"
            value={<Money value={shift.variance ?? '0'} />}
            tone={matched ? 'neutral' : variance?.lt(0) ? 'danger' : 'warning'}
          />
        </div>
      )}

      {shift.note && <p className="type-meta mt-2.5 italic">“{shift.note}”</p>}
    </div>
  )
}

function Cell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  tone?: 'neutral' | 'warning' | 'danger'
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl px-3 py-2',
        tone === 'danger'
          ? 'bg-tint-danger'
          : tone === 'warning'
            ? 'bg-tint-warning'
            : 'bg-background',
      )}
    >
      <p className="type-meta truncate">{label}</p>
      <p
        className={cn(
          'truncate text-sm font-bold tabular-nums',
          tone === 'danger'
            ? 'text-tint-danger-foreground'
            : tone === 'warning'
              ? 'text-tint-warning-foreground'
              : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  )
}

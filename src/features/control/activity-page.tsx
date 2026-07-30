import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  History,
  ShieldCheck,
  AlertTriangle,
  Info,
  MonitorSmartphone,
  ArrowRight,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Button } from '@/components/ui/button'
import {
  useActivityFeed,
  actionLabel,
  type ActivityRow,
  type ActivityFilters,
} from '@/features/control/use-activity'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime, businessDayStartUtc } from '@/lib/format'
import { ROLE_LABELS } from '@/features/control/roles'
import type { ActivitySeverity } from '@/types/database'
import { cn } from '@/lib/utils'

const SEVERITY_META: Record<
  ActivitySeverity,
  { label: string; icon: typeof Info; className: string }
> = {
  info: { label: 'Routine', icon: Info, className: 'text-text-muted bg-surface-muted' },
  notice: { label: 'Worth noting', icon: ShieldCheck, className: 'text-warning bg-warning/10' },
  exception: { label: 'To review', icon: AlertTriangle, className: 'text-danger bg-danger/10' },
}

export function ActivityLogPage() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const [searchParams] = useSearchParams()
  const shiftId = searchParams.get('shift') ?? undefined

  const [severity, setSeverity] = useState<ActivitySeverity | 'all'>('all')
  const [fromDate, setFromDate] = useState('')

  const filters: ActivityFilters = {
    severity,
    shiftId,
    from:
      fromDate && business
        ? businessDayStartUtc(new Date(`${fromDate}T12:00:00Z`), business.timezone)
        : undefined,
  }

  const { data: events, isLoading, isError, refetch } = useActivityFeed(filters)

  return (
    <div>
      <PageHeader
        title={shiftId ? 'Shift activity' : 'Activity log'}
        description={
          shiftId
            ? 'Everything that happened during this shift, in order.'
            : 'The complete record of consequential actions. It cannot be edited or deleted by anyone.'
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="text-xs font-medium text-text-secondary">Show</label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as ActivitySeverity | 'all')}>
              <SelectTrigger className="mt-1 w-44" aria-label="Filter by severity">
                <SelectValue>
                  {severity === 'all' ? 'Everything' : SEVERITY_META[severity].label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                <SelectItem value="exception">To review</SelectItem>
                <SelectItem value="notice">Worth noting</SelectItem>
                <SelectItem value="info">Routine</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">From</label>
            <Input
              type="date"
              className="mt-1"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          {(severity !== 'all' || fromDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSeverity('all')
                setFromDate('')
              }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && (!events || events.length === 0) && (
        <EmptyState
          icon={History}
          title="Nothing recorded yet"
          description="Sign-ins, sales, voids, approvals, and drawer movements will appear here as they happen."
        />
      )}

      {!isLoading && !isError && events && events.length > 0 && (
        <ul className="space-y-2">
          {events.map((event) => (
            <ActivityCard key={event.id} event={event} timezone={business?.timezone} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function ActivityCard({
  event,
  timezone,
  locale,
}: {
  event: ActivityRow
  timezone: string | undefined
  locale: string
}) {
  const meta = SEVERITY_META[event.severity]
  const Icon = meta.icon
  const wasApproved = !!event.authorized_by && event.authorized_by !== event.initiated_by

  return (
    <li className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', meta.className)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{actionLabel(event.action_type)}</p>

          {/* Dual actor — the whole point of the trail. */}
          <p className="mt-0.5 text-xs text-text-secondary">
            {event.initiated_by_name ?? 'Device account'}
            {event.initiated_by_role && (
              <span className="text-text-muted"> · {ROLE_LABELS[event.initiated_by_role]}</span>
            )}
            {wasApproved && (
              <>
                <ArrowRight className="mx-1 inline size-3 text-text-muted" />
                <span className="font-medium text-warning">
                  approved by {event.authorized_by_name ?? 'a manager'}
                </span>
              </>
            )}
          </p>

          <p className="mt-1 text-xs text-text-muted">
            {timezone ? formatDateTime(event.occurred_at, timezone, locale) : event.occurred_at}
            {event.terminal_name && (
              <>
                {' · '}
                <MonitorSmartphone className="mr-0.5 inline size-3" />
                {event.terminal_name}
              </>
            )}
          </p>

          {Object.keys(event.detail ?? {}).length > 0 && (
            <DetailChips detail={event.detail} />
          )}
        </div>
      </div>
    </li>
  )
}

const DETAIL_LABELS: Record<string, string> = {
  amount: 'Amount',
  percent: 'Percent',
  quantity: 'Quantity',
  total: 'Total',
  item_count: 'Items',
  product: 'Product',
  action: 'Action',
  reason: 'Reason',
  failed_count: 'Attempts',
  context: 'Where',
  self: 'Self-approved',
}

function DetailChips({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail).filter(([, value]) => value !== null && value !== undefined)
  if (entries.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-secondary"
        >
          <span className="text-text-muted">{DETAIL_LABELS[key] ?? key}:</span> {String(value)}
        </span>
      ))}
    </div>
  )
}

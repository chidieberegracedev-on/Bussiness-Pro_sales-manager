import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, EyeOff, Loader2, CheckCircle2, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import {
  useOpenCountSessions,
  useOpenCountSession,
  COUNT_MODE_LABELS,
} from '@/features/counting/use-count-session'
import { useDefaultLocation, useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { CountMode, CountStatus } from '@/types/database'
import { cn } from '@/lib/utils'

const STARTABLE_MODES: CountMode[] = ['cycle', 'full', 'category', 'aisle', 'zone', 'recount']

const STATUS_STYLE: Record<CountStatus, string> = {
  open: 'bg-info/10 text-info',
  counting: 'bg-warning/10 text-warning',
  pending_approval: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  cancelled: 'bg-surface-muted text-text-muted',
}

const STATUS_LABEL: Record<CountStatus, string> = {
  open: 'Open',
  counting: 'Counting',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
}

export function CountSessionsPage() {
  const navigate = useNavigate()
  const locale = useLocale()
  const { business } = useActiveBusiness()
  const { data: sessions, isLoading, isError, refetch } = useOpenCountSessions()
  const [startOpen, setStartOpen] = useState(false)

  const active = (sessions ?? []).find((s) => s.status === 'open' || s.status === 'counting')

  return (
    <div>
      <PageHeader
        title="Stock counts"
        description="Count what's on the shelf, compare it with what the system expects, and post the difference — once a manager approves it."
        actions={
          <Button onClick={() => setStartOpen(true)} disabled={!!active}>
            <Plus className="size-4" /> Start a count
          </Button>
        }
      />

      {active && (
        <Card className="mb-4 border-accent-primary/40">
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <ClipboardList className="size-5 text-accent-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                A count is in progress
                {active.is_blind && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
                    <EyeOff className="size-3" /> Blind
                  </span>
                )}
              </p>
              <p className="text-xs text-text-muted">
                {COUNT_MODE_LABELS[active.mode]} · opened{' '}
                {business && formatDateTime(active.opened_at, business.timezone, locale)}
              </p>
            </div>
            <Button onClick={() => navigate(`/inventory/counts/${active.id}`)}>Continue</Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <TableSkeleton rows={4} columns={4} />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && sessions && sessions.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No counts yet"
          description="A stock count is how the number in the system gets corrected to match the shelf — and how shrinkage becomes visible instead of just disappearing."
          action={
            <Button onClick={() => setStartOpen(true)}>
              <Plus className="size-4" /> Start your first count
            </Button>
          }
        />
      )}

      {!isLoading && !isError && sessions && sessions.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => navigate(`/inventory/counts/${session.id}`)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    session.status === 'approved'
                      ? 'bg-success/10 text-success'
                      : session.status === 'cancelled'
                        ? 'bg-surface-muted text-text-muted'
                        : 'bg-info/10 text-info',
                  )}
                >
                  {session.status === 'approved' ? (
                    <CheckCircle2 className="size-4" />
                  ) : session.status === 'cancelled' ? (
                    <Ban className="size-4" />
                  ) : (
                    <ClipboardList className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                    {COUNT_MODE_LABELS[session.mode]}
                    {session.is_blind && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-normal text-text-secondary">
                        <EyeOff className="size-3" /> Blind
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {business && formatDateTime(session.opened_at, business.timezone, locale)}
                    {session.approved_at && business && (
                      <> · approved {formatDateTime(session.approved_at, business.timezone, locale)}</>
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    STATUS_STYLE[session.status],
                  )}
                >
                  {STATUS_LABEL[session.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {startOpen && <StartCountDialog onClose={() => setStartOpen(false)} />}
    </div>
  )
}

function StartCountDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { data: location } = useDefaultLocation()
  const openSession = useOpenCountSession()

  const [mode, setMode] = useState<CountMode>('cycle')
  const [isBlind, setIsBlind] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (!location) {
      setError('No default location for this business.')
      return
    }
    setError(null)
    try {
      const session = await openSession.mutateAsync({
        locationId: location.id,
        mode,
        isBlind,
        variantIds: null,
      })
      toast({
        title: 'Count started',
        description: 'Expected quantities are frozen as of now.',
      })
      onClose()
      navigate(`/inventory/counts/${session.id}`)
    } catch (e) {
      setError(toReadableError(e))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start a stock count</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Opening a count takes a snapshot of what the system expects right now. Sales and
            deliveries carry on as normal — they won't move the numbers you're counting against.
          </p>

          <div>
            <label className="text-sm font-medium text-text-secondary">Type</label>
            <Select value={mode} onValueChange={(v) => setMode(v as CountMode)}>
              <SelectTrigger className="mt-1" aria-label="Count type">
                <SelectValue>{COUNT_MODE_LABELS[mode]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STARTABLE_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {COUNT_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <EyeOff className="size-3.5" /> Blind count
              </span>
              <span className="mt-0.5 block text-xs text-text-secondary">
                Hides the expected quantity until the count is submitted, so the counter reports
                what's there rather than what the screen says should be.
              </span>
            </span>
            <Switch checked={isBlind} onCheckedChange={setIsBlind} aria-label="Blind count" />
          </label>

          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={openSession.isPending}>
              Cancel
            </Button>
            <Button onClick={start} disabled={openSession.isPending}>
              {openSession.isPending && <Loader2 className="size-4 animate-spin" />}
              Start count
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

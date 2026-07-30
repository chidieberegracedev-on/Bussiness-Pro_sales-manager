import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  Clock,
  MonitorSmartphone,
  Vault,
  AlertTriangle,
  Users,
  Settings2,
  Plus,
  PauseCircle,
  UserRound,
  Wallet,
  Banknote,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { MoneyInput } from '@/components/money/money-input'
import { useLiveShifts, type LiveShift } from '@/features/control/use-activity'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { ROLE_LABELS } from '@/features/control/roles'
import { cn } from '@/lib/utils'

const DRAWER_LIMIT_KEY = 'bp-drawer-limit'

function runtimeLabel(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function LiveShiftsPage() {
  const navigate = useNavigate()
  const { data: shifts, isLoading, isError, refetch } = useLiveShifts()

  // The drawer ceiling is a branch operating preference, held locally rather
  // than as schema — it only drives a prompt, never a hard block.
  const [drawerLimit, setDrawerLimit] = useState(() => localStorage.getItem(DRAWER_LIMIT_KEY) ?? '')
  const [editingLimit, setEditingLimit] = useState(false)

  const limit = useMemo(() => {
    const value = Number(drawerLimit)
    return drawerLimit !== '' && value > 0 ? new Decimal(drawerLimit) : null
  }, [drawerLimit])

  function saveLimit(value: string) {
    setDrawerLimit(value)
    if (value) localStorage.setItem(DRAWER_LIMIT_KEY, value)
    else localStorage.removeItem(DRAWER_LIMIT_KEY)
  }

  return (
    <div>
      <PageHeader
        title="Live shifts"
        description="Who is on a till right now, how long they've been there, and what's in their drawer."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingLimit((v) => !v)}>
              <Settings2 className="size-3.5" /> Drawer limit
            </Button>
            <Button size="sm" onClick={() => navigate('/shifts/open')}>
              <Plus className="size-3.5" /> Open a shift
            </Button>
          </div>
        }
      />

      {editingLimit && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="min-w-48 flex-1">
              <label className="text-xs font-medium text-text-secondary">
                Prompt a safe drop above
              </label>
              <MoneyInput
                className="mt-1"
                value={drawerLimit}
                onChange={(e) => saveLimit(e.target.value)}
                placeholder="No limit"
              />
              <p className="mt-1 text-xs text-text-muted">
                A guide for this browser only. Nothing is blocked — it just flags a full till.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditingLimit(false)}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {/* Never a blank page: with no shift open, offer the action that starts one. */}
      {!isLoading && !isError && (!shifts || shifts.length === 0) && (
        <EmptyState
          icon={Users}
          title="No shift is open"
          description="A shift belongs to an employee on a terminal. Once someone signs in with their PIN and opens a drawer, it appears here live."
          action={
            <Button onClick={() => navigate('/shifts/open')}>
              <Plus className="size-4" /> Open a shift
            </Button>
          }
        />
      )}

      {!isLoading && !isError && shifts && shifts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shifts.map((shift) => (
            <LiveShiftCard key={shift.id} shift={shift} limit={limit} />
          ))}
        </div>
      )}
    </div>
  )
}

function LiveShiftCard({ shift, limit }: { shift: LiveShift; limit: Decimal | null }) {
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const locale = useLocale()

  const drawer = new Decimal(shift.drawer_cash)
  const overLimit = limit ? drawer.gt(limit) : false

  return (
    <Card className={cn(overLimit && 'border-warning/40')}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-sm font-semibold text-accent-primary">
              {(shift.operator_name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="font-medium text-text-primary">
                {shift.operator_name ?? 'Operator not recorded'}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {shift.operator_role && ROLE_LABELS[shift.operator_role]}
                {shift.terminal_name && (
                  <>
                    {shift.operator_role && ' · '}
                    <MonitorSmartphone className="mr-0.5 inline size-3" />
                    {shift.terminal_name}
                  </>
                )}
                {!shift.operator_role && !shift.terminal_name && 'Opened before PIN sign-in was set up'}
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            <Clock className="size-3" /> {runtimeLabel(shift.opened_at)}
          </span>
        </div>

        {/* The full drawer picture, not just a total. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure icon={Wallet} label="Float" value={<Money value={shift.opening_float} />} />
          <Figure icon={Wallet} label="Cash sales" value={<Money value={shift.cash_in} />} />
          <Figure icon={Banknote} label="Card / transfer" value={<Money value={shift.bank_in} />} />
          <Figure icon={Vault} label="Paid out" value={<Money value={shift.cash_out} />} />
        </div>

        <div
          className={cn(
            'mt-3 flex items-center justify-between rounded-lg border p-3',
            overLimit ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface-muted/40',
          )}
        >
          <span className="text-sm text-text-secondary">Expected in drawer</span>
          <span
            className={cn(
              'text-lg font-bold tabular-nums',
              overLimit ? 'text-warning' : 'text-text-primary',
            )}
          >
            <Money value={drawer} />
          </span>
        </div>

        {overLimit && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
            <Vault className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-sm text-text-secondary">
              Above your <Money value={limit!} /> guide — a safe drop would reduce what's sitting in
              the till.
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-text-secondary">
          {shift.basket_count > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <PauseCircle className="size-4 text-text-muted" />
              {shift.basket_count} basket{shift.basket_count === 1 ? '' : 's'} on hold
            </span>
          )}
          {shift.exception_count > 0 && (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <AlertTriangle className="size-4" />
              {shift.exception_count} to review
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/control/activity?shift=${shift.id}`)}
          >
            Shift activity
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/shifts/${shift.id}/close`)}>
            Close shift
          </Button>
        </div>

        {business && (
          <p className="mt-3 flex items-center gap-1 text-xs text-text-muted">
            <UserRound className="size-3" />
            Opened {formatDateTime(shift.opened_at, business.timezone, locale)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Figure({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted/40 p-2.5">
      <p className="flex items-center gap-1 text-xs text-text-muted">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  )
}

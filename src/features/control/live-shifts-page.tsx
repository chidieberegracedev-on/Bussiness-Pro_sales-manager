import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Clock, MonitorSmartphone, Vault, AlertTriangle, Users, Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { MoneyInput } from '@/components/money/money-input'
import { useLiveShifts } from '@/features/control/use-activity'
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
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: shifts, isLoading, isError, refetch } = useLiveShifts()

  // The drawer ceiling is a branch operating preference, held locally rather
  // than as schema — it only drives a prompt, never a hard block.
  const [drawerLimit, setDrawerLimit] = useState(
    () => localStorage.getItem(DRAWER_LIMIT_KEY) ?? '',
  )
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
          <Button variant="outline" size="sm" onClick={() => setEditingLimit((v) => !v)}>
            <Settings2 className="size-3.5" /> Drawer limit
          </Button>
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
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && (!shifts || shifts.length === 0) && (
        <EmptyState
          icon={Users}
          title="No shifts open"
          description="When an employee opens a shift at a terminal, it appears here in real time."
        />
      )}

      {!isLoading && !isError && shifts && shifts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shifts.map((shift) => {
            const drawer = new Decimal(shift.drawer_cash)
            const overLimit = limit ? drawer.gt(limit) : false
            const exceptions = Number(shift.exception_count)
            return (
              <Card
                key={shift.id}
                className={cn(overLimit && 'border-warning/40')}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-sm font-semibold text-accent-primary">
                        {(shift.opened_by_name ?? '?').slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium text-text-primary">
                          {shift.opened_by_name ?? 'Unknown operator'}
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {shift.opened_by_role ? ROLE_LABELS[shift.opened_by_role] : ''}
                          {shift.terminal_name && (
                            <>
                              {' · '}
                              <MonitorSmartphone className="mr-0.5 inline size-3" />
                              {shift.terminal_name}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      <Clock className="size-3" /> {runtimeLabel(shift.opened_at)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                      <p className="text-xs text-text-muted">Opening float</p>
                      <p className="mt-0.5 font-semibold text-text-primary">
                        <Money value={shift.opening_float} />
                      </p>
                    </div>
                    <div
                      className={cn(
                        'rounded-lg border p-3',
                        overLimit
                          ? 'border-warning/40 bg-warning/5'
                          : 'border-border bg-surface-muted/40',
                      )}
                    >
                      <p className="text-xs text-text-muted">In drawer now</p>
                      <p
                        className={cn(
                          'mt-0.5 font-semibold',
                          overLimit ? 'text-warning' : 'text-text-primary',
                        )}
                      >
                        <Money value={drawer} />
                      </p>
                    </div>
                  </div>

                  {overLimit && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                      <Vault className="mt-0.5 size-4 shrink-0 text-warning" />
                      <p className="text-sm text-text-secondary">
                        Drawer is above your <Money value={limit!} /> guide — a safe drop would
                        reduce what's sitting in the till.
                      </p>
                    </div>
                  )}

                  {exceptions > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
                      <AlertTriangle className="size-4 text-warning" />
                      {exceptions} item{exceptions === 1 ? '' : 's'} to review this shift
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/control/activity?shift=${shift.id}`)}
                    >
                      Shift activity
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/shifts/${shift.id}/close`)}
                    >
                      Close shift
                    </Button>
                  </div>

                  {business && (
                    <p className="mt-3 text-xs text-text-muted">
                      Opened {formatDateTime(shift.opened_at, business.timezone, locale)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

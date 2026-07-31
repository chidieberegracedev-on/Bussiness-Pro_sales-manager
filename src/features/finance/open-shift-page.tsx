import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Clock, MapPin, Info, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { MoneyInput } from '@/components/money/money-input'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useOpenShift, useOpenShiftMutation } from '@/features/finance/use-shifts'
import { Term } from '@/features/help/term'
import { useEmployeeSessionStore, getTerminalId } from '@/features/control/session-store'
import { ROLE_LABELS } from '@/features/control/roles'
import { UserRound, MonitorSmartphone, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

export function OpenShiftPage() {
  const navigate = useNavigate()
  const { membership, isMultiOperator } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const { data: existing } = useOpenShift(location?.id)
  const openMutation = useOpenShiftMutation()

  const [searchParams] = useSearchParams()
  // A handover arrives with the previous shift's counted cash pre-filled.
  const handoverFloat = searchParams.get('float')
  const [openingFloat, setOpeningFloat] = useState(handoverFloat ?? '')

  const sessionContext = useEmployeeSessionStore((s) => s.context)
  const hasOperator = sessionContext?.status === 'active'
  const terminalId = getTerminalId()
  // Identity is only a precondition when there's more than one identity. In
  // single-owner mode the drawer belongs to the account holder by definition.
  const identityReady = !isMultiOperator || (hasOperator && !!terminalId)
  const canOpen = identityReady && !!location && !existing

  async function handleOpen() {
    if (!location) return
    try {
      const shift = await openMutation.mutateAsync({
        locationId: location.id,
        openingFloat: openingFloat || '0',
      })
      toast({ title: 'Shift opened', description: 'Cash sales will attach automatically.' })
      navigate(`/shifts/${shift.id}/close`, { replace: true })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't open shift",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/shifts')}>
        <ArrowLeft className="size-4" /> Shifts
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5" /> Open shift
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {existing && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text-secondary">
              A shift is already open at this location. Close it before opening another.
            </div>
          )}

          {/* Identity first: a shift belongs to an employee on a terminal, so
              both must be resolved before the float even matters. */}
          {isMultiOperator && !hasOperator && (
            <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/5 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <div className="text-sm">
                <p className="font-medium text-text-primary">No operator signed in</p>
                <p className="mt-0.5 text-text-secondary">
                  A shift has to belong to a person. Sign in with a PIN at this terminal first.
                </p>
              </div>
            </div>
          )}

          {isMultiOperator && !terminalId && (
            <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/5 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <div className="text-sm">
                <p className="font-medium text-text-primary">This device isn't a terminal</p>
                <p className="mt-0.5 text-text-secondary">
                  Register it in{' '}
                  <Link to="/settings/terminals" className="font-medium text-accent-primary hover:underline">
                    Settings › Terminals
                  </Link>{' '}
                  so drawer activity can be traced to a till.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-border bg-surface-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2 text-text-secondary">
              <UserRound className="size-4 text-text-muted" />
              <span>
                Operator:{' '}
                <span className="font-medium text-text-primary">
                  {sessionContext?.display_name ??
                    (isMultiOperator ? 'Not signed in' : membership?.display_name || 'You')}
                </span>
                {sessionContext && (
                  <span className="ml-1 text-xs text-text-muted">
                    ({ROLE_LABELS[sessionContext.role]})
                  </span>
                )}
              </span>
            </div>
            {/* A terminal only means something once there's more than one till
                and more than one person standing at them. */}
            {isMultiOperator && (
              <div className="flex items-center gap-2 text-text-secondary">
                <MonitorSmartphone className="size-4 text-text-muted" />
                <span>
                  Terminal:{' '}
                  <span className="font-medium text-text-primary">
                    {sessionContext?.terminal_name ??
                      (terminalId ? 'This device' : 'Not registered')}
                  </span>
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-text-secondary">
              <MapPin className="size-4 text-text-muted" />
              <span>
                Location:{' '}
                <span className="font-medium text-text-primary">{location?.name ?? '—'}</span>
              </span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary">
              Opening <Term slug="float">float</Term>
            </label>
            <MoneyInput
              className="mt-1.5"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="0.00"
              autoFocus
              disabled={!!existing}
            />
            {handoverFloat ? (
              <p className="mt-1.5 flex items-start gap-1 text-xs text-accent-primary">
                <ArrowRightLeft className="mt-0.5 size-3 shrink-0" />
                Carried over from the shift just closed. Check the drawer and adjust if it differs.
              </p>
            ) : (
              <p className="mt-1.5 flex items-start gap-1 text-xs text-text-muted">
                <Info className="mt-0.5 size-3 shrink-0" />
                The cash you're starting the drawer with. Enter 0 if you're starting empty.
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/shifts')}>
            Cancel
          </Button>
          <Button onClick={handleOpen} disabled={!canOpen || openMutation.isPending}>
            {openMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Open shift
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { KeyRound, Users, Loader2, ShieldAlert, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import { PinPad } from '@/features/control/pin-pad'
import {
  useEmployees,
  useSetEmployeePin,
  useUpdateEmployeeRole,
  type EmployeeRow,
} from '@/features/control/use-terminals'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/features/control/roles'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { MemberRole } from '@/types/database'

const ASSIGNABLE_ROLES: MemberRole[] = ['owner', 'manager', 'inventory_staff', 'cashier']

export function SettingsEmployeesPage() {
  const { business, role: myRole } = useActiveBusiness()
  const locale = useLocale()
  const isOwner = myRole === 'owner'
  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const updateEmployee = useUpdateEmployeeRole()

  const [pinTarget, setPinTarget] = useState<EmployeeRow | null>(null)

  async function changeRole(memberId: string, role: MemberRole) {
    try {
      await updateEmployee.mutateAsync({ memberId, role })
      toast({ title: 'Role updated' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't change role",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Employees &amp; PINs</CardTitle>
          <CardDescription>
            Each employee signs in at a terminal with a 4-digit PIN. Their PIN identifies them on
            every sale, void, and drawer movement — separately from the account this device is
            logged in as.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <TableSkeleton rows={3} columns={3} />}
          {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

          {!isLoading && !isError && employees && employees.length === 0 && (
            <EmptyState
              icon={Users}
              title="No team members yet"
              description="People who join this business appear here, ready to be given a role and a PIN."
            />
          )}

          {!isLoading && !isError && employees && employees.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {employees.map((employee) => {
                const locked =
                  employee.pin_locked_until && new Date(employee.pin_locked_until) > new Date()
                return (
                  <li key={employee.member_id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-sm font-semibold text-accent-primary">
                      {employee.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {employee.display_name}
                        </p>
                        {employee.has_pin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            <Check className="size-3" /> PIN set
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                            No PIN
                          </span>
                        )}
                        {locked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                            <ShieldAlert className="size-3" /> Locked
                          </span>
                        )}
                        {employee.status !== 'active' && (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs capitalize text-text-muted">
                            {employee.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {ROLE_DESCRIPTIONS[employee.role]}
                        {locked && business && (
                          <>
                            {' '}
                            · unlocks{' '}
                            {formatDateTime(employee.pin_locked_until!, business.timezone, locale)}
                          </>
                        )}
                      </p>
                    </div>

                    <Select
                      value={employee.role}
                      onValueChange={(v) => changeRole(employee.member_id, v as MemberRole)}
                      disabled={!isOwner || updateEmployee.isPending}
                    >
                      <SelectTrigger className="w-40" aria-label={`Role for ${employee.display_name}`}>
                        <SelectValue>{ROLE_LABELS[employee.role]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button variant="outline" size="sm" onClick={() => setPinTarget(employee)}>
                      <KeyRound className="size-3.5" />
                      {employee.has_pin ? 'Reset PIN' : 'Set PIN'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {!isOwner && (
            <p className="text-xs text-text-muted">
              Only an owner can change roles. Managers can set and reset PINs.
            </p>
          )}
          <p className="text-xs text-text-muted">
            PINs are stored as one-way hashes. Nobody — including owners — can read an existing PIN
            back; it can only be replaced.
          </p>
        </CardContent>
      </Card>

      {pinTarget && (
        <SetPinDialog employee={pinTarget} onClose={() => setPinTarget(null)} />
      )}
    </div>
  )
}

function SetPinDialog({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const setPin = useSetEmployeePin()
  const [firstEntry, setFirstEntry] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(pin: string) {
    setError(null)
    if (!firstEntry) {
      setFirstEntry(pin)
      return
    }
    if (pin !== firstEntry) {
      setFirstEntry(null)
      setError("Those PINs didn't match. Start again.")
      return
    }
    setPin.mutate(
      { memberId: employee.member_id, pin },
      {
        onSuccess: () => {
          toast({
            title: 'PIN set',
            description: `${employee.display_name} can now sign in at a terminal.`,
          })
          onClose()
        },
        onError: (e) => {
          setFirstEntry(null)
          setError(toReadableError(e))
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {employee.has_pin ? 'Reset' : 'Set'} PIN · {employee.display_name}
          </DialogTitle>
        </DialogHeader>
        <div>
          <p className="mb-4 text-center text-sm text-text-secondary">
            {firstEntry ? 'Enter the same 4 digits again to confirm' : 'Choose a 4-digit PIN'}
          </p>
          <div className="flex justify-center">
            <PinPad
              key={firstEntry ? 'confirm' : 'first'}
              onSubmit={handleSubmit}
              submitting={setPin.isPending}
              error={error}
              onClearError={() => setError(null)}
            />
          </div>
          {setPin.isPending && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Saving
            </p>
          )}
          <p className="mt-4 text-center text-xs text-text-muted">
            Give the PIN to {employee.display_name} directly — it can't be viewed again here.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

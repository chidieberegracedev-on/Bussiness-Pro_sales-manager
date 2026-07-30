import { useMemo, useState } from 'react'
import {
  Users,
  KeyRound,
  Search,
  ShieldAlert,
  Check,
  Pencil,
  Archive,
  ArchiveRestore,
  Info,
  Loader2,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, FilteredEmptyState } from '@/components/data/empty-state'
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
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatDate, formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { MemberRole } from '@/types/database'
import { cn } from '@/lib/utils'

const ASSIGNABLE_ROLES: MemberRole[] = ['owner', 'manager', 'inventory_staff', 'cashier']

/**
 * The employee directory — the identity foundation the roles, PINs, sessions,
 * and shifts all hang off. The names here are exactly what the terminal PIN pad
 * lists, so an empty directory means an empty lock screen.
 */
export function EmployeeDirectoryPage() {
  const { business, role: myRole } = useActiveBusiness()
  const locale = useLocale()
  const isOwner = myRole === 'owner'

  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const updateEmployee = useUpdateEmployeeRole()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [roleFilter, setRoleFilter] = useState<MemberRole | 'all'>('all')
  const [showInactive, setShowInactive] = useState(false)

  const [pinTarget, setPinTarget] = useState<EmployeeRow | null>(null)
  const [nameTarget, setNameTarget] = useState<EmployeeRow | null>(null)

  const filtered = useMemo(() => {
    let list = employees ?? []
    if (!showInactive) list = list.filter((e) => e.status === 'active')
    if (roleFilter !== 'all') list = list.filter((e) => e.role === roleFilter)
    const q = debouncedSearch.trim().toLowerCase()
    if (q) list = list.filter((e) => e.display_name.toLowerCase().includes(q))
    return list
  }, [employees, showInactive, roleFilter, debouncedSearch])

  const withoutPin = useMemo(
    () => (employees ?? []).filter((e) => e.status === 'active' && !e.has_pin).length,
    [employees],
  )

  async function patch(values: Parameters<typeof updateEmployee.mutateAsync>[0]) {
    try {
      await updateEmployee.mutateAsync(values)
      toast({ title: 'Employee updated' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't update employee",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Everyone who works this business, what they're allowed to do, and how they sign in at a till."
      />

      {/* How a person joins — the schema requires a real account, so say so plainly. */}
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/5 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="text-sm">
          <p className="font-medium text-text-primary">Adding someone new</p>
          <p className="mt-0.5 text-text-secondary">
            A person signs up for their own account and joins this business — then they appear here,
            where you set their name, role, and PIN. Their PIN is what identifies them at a terminal;
            they never need the business email and password.
          </p>
        </div>
      </div>

      {withoutPin > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-sm text-text-secondary">
            {withoutPin} active {withoutPin === 1 ? 'person has' : 'people have'} no PIN yet, so they
            can't sign in at a terminal.
          </p>
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              className="pl-9"
              aria-label="Search employees"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as MemberRole | 'all')}>
            <SelectTrigger className="w-44" aria-label="Filter by role">
              <SelectValue>
                {roleFilter === 'all' ? 'All roles' : ROLE_LABELS[roleFilter]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Show inactive
          </label>
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton rows={4} columns={4} />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && employees && employees.length === 0 && (
        <EmptyState
          icon={Users}
          title="No one here yet"
          description="Once someone joins this business, they appear here so you can set their role and PIN."
        />
      )}

      {!isLoading && !isError && employees && employees.length > 0 && filtered.length === 0 && (
        <FilteredEmptyState
          onClear={() => {
            setSearch('')
            setRoleFilter('all')
            setShowInactive(false)
          }}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((employee) => {
            const locked =
              employee.pin_locked_until && new Date(employee.pin_locked_until) > new Date()
            const inactive = employee.status !== 'active'
            return (
              <li
                key={employee.member_id}
                className={cn(
                  'rounded-lg border border-border bg-card p-3.5',
                  inactive && 'opacity-60',
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-sm font-semibold text-accent-primary">
                    {employee.display_name.slice(0, 1).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-text-primary">
                        {employee.display_name}
                      </p>
                      {employee.has_pin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          <Check className="size-3" /> PIN set
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                          No PIN
                        </span>
                      )}
                      {locked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                          <ShieldAlert className="size-3" /> Locked
                        </span>
                      )}
                      {inactive && (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs capitalize text-text-muted">
                          {employee.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {ROLE_DESCRIPTIONS[employee.role]}
                    </p>
                    {locked && business && (
                      <p className="mt-0.5 text-xs text-danger">
                        Unlocks {formatDateTime(employee.pin_locked_until!, business.timezone, locale)}
                      </p>
                    )}
                    {employee.created_at && business && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        Joined {formatDate(employee.created_at, business.timezone, locale)}
                      </p>
                    )}
                  </div>

                  <Select
                    value={employee.role}
                    onValueChange={(v) => patch({ memberId: employee.member_id, role: v as MemberRole })}
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

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setNameTarget(employee)}
                    aria-label={`Rename ${employee.display_name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => setPinTarget(employee)}>
                    <KeyRound className="size-3.5" />
                    {employee.has_pin ? 'Reset PIN' : 'Set PIN'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!isOwner}
                    onClick={() =>
                      patch({
                        memberId: employee.member_id,
                        status: inactive ? 'active' : 'suspended',
                      })
                    }
                    aria-label={inactive ? 'Reactivate employee' : 'Deactivate employee'}
                  >
                    {inactive ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-6 text-xs text-text-muted">
        PINs are stored as one-way hashes — nobody, including owners, can read an existing PIN back.
        It can only be replaced. Five wrong attempts locks that person out for 15 minutes.
        {!isOwner && ' Only an owner can change roles or deactivate someone.'}
      </p>

      {pinTarget && <SetPinDialog employee={pinTarget} onClose={() => setPinTarget(null)} />}
      {nameTarget && (
        <RenameDialog
          employee={nameTarget}
          onClose={() => setNameTarget(null)}
          onSave={(name) => patch({ memberId: nameTarget.member_id, display_name: name })}
        />
      )}
    </div>
  )
}

function RenameDialog({
  employee,
  onClose,
  onSave,
}: {
  employee: EmployeeRow
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(employee.display_name)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Display name</DialogTitle>
        </DialogHeader>
        <div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Display name"
          />
          <p className="mt-1.5 text-xs text-text-muted">
            This is the name shown on the terminal sign-in pad and against every action they take.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="size-4" /> Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(name.trim())
              onClose()
            }}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

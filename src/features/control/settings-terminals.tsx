import { useState, type FormEvent } from 'react'
import {
  MonitorSmartphone,
  Plus,
  Loader2,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  Link2,
  Unlink,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import {
  useTerminals,
  useCreateTerminal,
  useUpdateTerminal,
} from '@/features/control/use-terminals'
import { getTerminalId, setTerminalId } from '@/features/control/session-store'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

const DEVICE_TYPES = [
  { value: 'web', label: 'Web browser' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop', label: 'Desktop till' },
  { value: 'mobile', label: 'Phone' },
]

export function SettingsTerminalsPage() {
  const { business, isMultiOperator } = useActiveBusiness()
  const locale = useLocale()
  const { data: terminals, isLoading, isError, refetch } = useTerminals(true)
  const createTerminal = useCreateTerminal()
  const updateTerminal = useUpdateTerminal()

  const [name, setName] = useState('')
  const [type, setType] = useState('web')
  // Local, so the "this device" badge re-renders after claiming a terminal.
  const [claimed, setClaimed] = useState<string | null>(() => getTerminalId())

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const terminal = await createTerminal.mutateAsync({ deviceName: trimmed, deviceType: type })
      setName('')
      // Deliberately NOT claimed automatically. Binding a device to a terminal
      // turns it into a till that asks for a PIN, and the device doing the
      // registering is usually the owner's own — claiming it silently would
      // hand them a lock screen they never asked for.
      toast({
        title: 'Terminal registered',
        description: `${terminal.device_name} — use "Use on this device" on the till itself.`,
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't register terminal",
        description: toReadableError(error),
      })
    }
  }

  function claim(id: string) {
    setTerminalId(id)
    setClaimed(id)
    toast({
      title: 'This device is now that terminal',
      description: isMultiOperator
        ? 'It will ask for an operator PIN from now on. You can still reach admin from here.'
        : 'Employees signing in here will be recorded against it.',
    })
  }

  function unclaim() {
    setTerminalId(null)
    setClaimed(null)
    toast({
      title: 'This device is no longer a terminal',
      description: 'It goes back to being an ordinary admin device.',
    })
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await updateTerminal.mutateAsync({ id, is_active: isActive })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't update terminal",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Terminals</CardTitle>
          <CardDescription>
            Register each till or device that employees sign in to. Every sale, drawer movement, and
            override is recorded against a terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isMultiOperator && (
            <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-muted/50 p-3 text-sm text-text-secondary">
              <Info className="mt-0.5 size-4 shrink-0 text-text-muted" />
              <p>
                You're the only person using this business, so terminals aren't doing anything yet —
                there's nobody to tell apart. They start to matter when you add an employee. Nothing
                here will put a sign-in screen in front of you.
              </p>
            </div>
          )}

          <form onSubmit={handleCreate} className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Device name (e.g. Front counter till)"
              aria-label="Device name"
              className="min-w-48 flex-1"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40" aria-label="Device type">
                <SelectValue>
                  {DEVICE_TYPES.find((d) => d.value === type)?.label ?? type}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={createTerminal.isPending || !name.trim()}>
              {createTerminal.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Register
            </Button>
          </form>

          {isLoading && <TableSkeleton rows={3} columns={3} />}
          {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

          {!isLoading && !isError && terminals && terminals.length === 0 && (
            <EmptyState
              icon={MonitorSmartphone}
              title="No terminals registered"
              description="Register this device to start signing employees in with a PIN."
            />
          )}

          {!isLoading && !isError && terminals && terminals.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {terminals.map((terminal) => {
                const isThisDevice = claimed === terminal.id
                return (
                  <li key={terminal.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        isThisDevice
                          ? 'bg-accent-primary/10 text-accent-primary'
                          : 'bg-surface-muted text-text-muted',
                      )}
                    >
                      <MonitorSmartphone className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {terminal.device_name}
                        </p>
                        {isThisDevice && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs font-medium text-accent-primary">
                            <CheckCircle2 className="size-3" /> This device
                          </span>
                        )}
                        {!terminal.is_active && (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {DEVICE_TYPES.find((d) => d.value === terminal.device_type)?.label ??
                          terminal.device_type}
                        {terminal.last_active_at && business && (
                          <> · last used {formatDateTime(terminal.last_active_at, business.timezone, locale)}</>
                        )}
                      </p>
                    </div>
                    {!isThisDevice && terminal.is_active && (
                      <Button variant="outline" size="sm" onClick={() => claim(terminal.id)}>
                        <Link2 className="size-3.5" /> Use on this device
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActive(terminal.id, !terminal.is_active)}
                      aria-label={terminal.is_active ? 'Deactivate terminal' : 'Reactivate terminal'}
                    >
                      {terminal.is_active ? (
                        <Archive className="size-4" />
                      ) : (
                        <ArchiveRestore className="size-4" />
                      )}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {claimed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted/50 p-3">
              <p className="text-xs text-text-muted">
                This browser is acting as a registered terminal
                {isMultiOperator && ', so it shows the operator sign-in screen'}. Clearing site data
                will unlink it.
              </p>
              <Button variant="outline" size="sm" onClick={unclaim}>
                <Unlink className="size-3.5" /> Stop using this device as a terminal
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

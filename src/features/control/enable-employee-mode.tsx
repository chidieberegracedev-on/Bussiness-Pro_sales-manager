import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  KeyRound,
  UserPlus,
  MonitorSmartphone,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PinPad } from '@/features/control/pin-pad'
import { useCreateOperator, useResetOperatorPin } from '@/features/control/use-terminals'
import { useEnableOperatorMode } from '@/features/control/use-operator-mode'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/features/control/roles'
import { useActiveBusiness } from '@/features/business/hooks'
import { toReadableError } from '@/lib/errors'
import type { MemberRole } from '@/types/database'

const STAFF_ROLES: MemberRole[] = ['cashier', 'inventory_staff', 'manager']

type Step = 'explain' | 'owner-pin' | 'employee' | 'done'

/**
 * The one-way door from single-owner mode into employee mode.
 *
 * Everything the control layer does — operator selection, PIN unlock, terminal
 * binding, shift enforcement — exists to answer "who did this?". That question
 * only has meaning once more than one person touches the till, so the whole
 * layer stays dormant until this wizard runs. It is deliberately the ONLY way
 * to enable it, and it refuses to finish until the owner can still get back in.
 *
 * Order matters: owner PIN first, then the employee, then the flag. Enabling
 * before the owner has a PIN would strand them on a lock screen they can't pass
 * — the server refuses that too, but the flow should never even offer it.
 */
export function EnableEmployeeModeDialog({
  ownerHasPin,
  onClose,
}: {
  ownerHasPin: boolean
  onClose: () => void
}) {
  const { membership } = useActiveBusiness()
  const [step, setStep] = useState<Step>('explain')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'explain' && 'Adding your first employee'}
            {step === 'owner-pin' && 'First, your own PIN'}
            {step === 'employee' && 'Add your first employee'}
            {step === 'done' && 'Employee mode is on'}
          </DialogTitle>
        </DialogHeader>

        {step === 'explain' && (
          <ExplainStep
            ownerHasPin={ownerHasPin}
            onCancel={onClose}
            onContinue={() => setStep(ownerHasPin ? 'employee' : 'owner-pin')}
          />
        )}

        {step === 'owner-pin' && (
          <OwnerPinStep
            memberId={membership?.id}
            onBack={() => setStep('explain')}
            onDone={() => setStep('employee')}
          />
        )}

        {step === 'employee' && (
          <FirstEmployeeStep
            onBack={() => setStep(ownerHasPin ? 'explain' : 'owner-pin')}
            onDone={() => setStep('done')}
          />
        )}

        {step === 'done' && <DoneStep onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ExplainStep({
  ownerHasPin,
  onCancel,
  onContinue,
}: {
  ownerHasPin: boolean
  onCancel: () => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Right now this business is just you, so the software stays out of your way. Adding someone
        else changes that: once two people use the same till, every sale, discount, and drawer
        movement has to be traceable to a person.
      </p>

      <ul className="space-y-3">
        <Point icon={KeyRound} title="Everyone gets a 4-digit PIN">
          Including you. Employees never get an email or password — the PIN is their whole sign-in,
          and it's what puts their name against their work.
        </Point>
        <Point icon={MonitorSmartphone} title="Tills show a sign-in screen">
          Only devices you register as terminals. This one stays on admin — you're never locked out
          of your own dashboard.
        </Point>
        <Point icon={ShieldCheck} title="Shifts and approvals switch on">
          Cash drawers get opened and counted per person, and the actions you restrict will ask for a
          manager's PIN.
        </Point>
      </ul>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>
          Not yet
        </Button>
        <Button onClick={onContinue}>{ownerHasPin ? 'Add employee' : 'Set my PIN first'}</Button>
      </div>
    </div>
  )
}

function Point({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof KeyRound
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
        <Icon className="size-3.5" />
      </span>
      <div className="text-sm">
        <p className="font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-text-secondary">{children}</p>
      </div>
    </li>
  )
}

function OwnerPinStep({
  memberId,
  onBack,
  onDone,
}: {
  memberId: string | undefined
  onBack: () => void
  onDone: () => void
}) {
  const setPin = useResetOperatorPin()
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
    if (!memberId) {
      setError('Could not find your operator record.')
      return
    }
    setPin.mutate(
      { memberId, newPin: pin },
      {
        onSuccess: onDone,
        onError: (e) => {
          setFirstEntry(null)
          setError(toReadableError(e))
        },
      },
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm text-text-secondary">
        Yours comes first — it's how you sign in at a till, and it's what keeps you able to reach
        admin if you ever hand a device over. Nobody can read it back, including you.
      </p>
      <p className="mb-4 text-center text-sm font-medium text-text-primary">
        {firstEntry ? 'Enter the same 4 digits again to confirm' : 'Choose your 4-digit PIN'}
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
      <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={onBack}>
        <ArrowLeft className="size-4" /> Back
      </Button>
    </div>
  )
}

/**
 * Creates the employee, then flips the mode. If the flag write fails the
 * employee still exists and the business stays single-owner — recoverable, and
 * the reverse order (flag first) would not be.
 */
function FirstEmployeeStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const createOperator = useCreateOperator()
  const enableMode = useEnableOperatorMode()

  const [phase, setPhase] = useState<'details' | 'pin'>('details')
  const [name, setName] = useState('')
  const [role, setRole] = useState<MemberRole>('cashier')
  const [pin, setPin] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePinSubmit(entered: string) {
    setError(null)
    if (!confirming) {
      setPin(entered)
      setConfirming(true)
      return
    }
    if (entered !== pin) {
      setPin(null)
      setConfirming(false)
      setError("Those PINs didn't match. Start again.")
      return
    }
    try {
      await createOperator.mutateAsync({ displayName: name.trim(), role, pin: entered })
      await enableMode.mutateAsync()
      onDone()
    } catch (e) {
      setPin(null)
      setConfirming(false)
      setError(toReadableError(e))
    }
  }

  const busy = createOperator.isPending || enableMode.isPending

  if (phase === 'details') {
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-text-secondary">Full name</label>
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their full name"
            autoFocus
          />
          <p className="mt-1 text-xs text-text-muted">
            Shown on the terminal sign-in list and against everything they do.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-text-secondary">Role</label>
          <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
            <SelectTrigger className="mt-1" aria-label="Role">
              <SelectValue>{ROLE_LABELS[role]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-text-muted">{ROLE_DESCRIPTIONS[role]}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button onClick={() => setPhase('pin')} disabled={!name.trim()}>
            Next: their PIN
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="text-sm font-semibold text-text-primary">{name.trim()}</p>
        <p className="text-xs text-text-muted">{ROLE_LABELS[role]}</p>
        <p className="mt-2 text-sm text-text-secondary">
          {confirming ? 'Enter the same 4 digits again to confirm' : 'Choose their 4-digit PIN'}
        </p>
      </div>
      <div className="flex justify-center">
        <PinPad
          key={confirming ? 'confirm' : 'first'}
          onSubmit={handlePinSubmit}
          submitting={busy}
          error={error}
          onClearError={() => setError(null)}
        />
      </div>
      {busy && (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-text-muted">
          <Loader2 className="size-3.5 animate-spin" />
          {enableMode.isPending ? 'Turning employee mode on' : 'Creating'}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-4 w-full"
        disabled={busy}
        onClick={() => {
          setPin(null)
          setConfirming(false)
          setError(null)
          setPhase('details')
        }}
      >
        Back to details
      </Button>
    </div>
  )
}

function DoneStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 p-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-sm text-text-secondary">
          Your PIN is set and your first employee can sign in. This device stays on admin — you reach
          the dashboard from here as you always have.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-text-primary">What's worth doing next</p>
        <ul className="mt-2 space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-text-muted" />
            <span>
              Register the tills your staff will work in{' '}
              <Link
                to="/settings/terminals"
                className="font-medium text-accent-primary hover:underline"
                onClick={onClose}
              >
                Settings › Terminals
              </Link>
              . Only registered devices show the sign-in screen.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-text-muted" />
            <span>Add the rest of your team here, each with their own role and PIN.</span>
          </li>
          <li className="flex items-start gap-2">
            <UserPlus className="mt-0.5 size-4 shrink-0 text-text-muted" />
            <span>Hand a PIN to each person directly — it can't be viewed again afterwards.</span>
          </li>
        </ul>
      </div>

      <div className="flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Crown, ShieldCheck, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PinPad } from '@/features/control/pin-pad'
import { useResetOperatorPin } from '@/features/control/use-terminals'
import { useActiveBusiness } from '@/features/business/hooks'
import { useProfile } from '@/features/auth/use-profile'
import { ROLE_LABELS } from '@/features/control/roles'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * Shown once, when a business has no operator PINs at all.
 *
 * Without this the gate would be unpassable: everyone signs in with a PIN, but
 * nobody has one yet. Setting the account holder's own PIN — through the same
 * reset_operator_pin path every other operator uses — bootstraps the business,
 * after which the operator selection screen takes over permanently.
 */
export function OwnerPinSetupScreen({ onDone }: { onDone: () => void }) {
  const { business, membership, role } = useActiveBusiness()
  const { data: profile } = useProfile()
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
    if (!membership) {
      setError('Could not find your operator record.')
      return
    }
    setPin.mutate(
      { memberId: membership.id, newPin: pin },
      {
        onSuccess: () => {
          toast({
            title: 'Your PIN is set',
            description: 'Use it to sign in at any terminal from now on.',
          })
          onDone()
        },
        onError: (e) => {
          setFirstEntry(null)
          setError(toReadableError(e))
        },
      },
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background-subtle p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <Crown className="size-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {business?.name ?? 'Business Pro'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">Set up your operator PIN</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/5 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="text-sm">
              <p className="font-medium text-text-primary">Why you need one</p>
              <p className="mt-0.5 text-text-secondary">
                The email and password you just used signs in the business. From here on, everyone —
                including you — opens their workspace with a personal 4-digit PIN, so every sale and
                every drawer movement is traced to a person.
              </p>
            </div>
          </div>

          <div className="mb-4 text-center">
            <p className="text-sm font-semibold text-text-primary">
              {profile?.full_name || 'You'}
            </p>
            <p className="text-xs text-text-muted">{role ? ROLE_LABELS[role] : 'Account holder'}</p>
            <p className="mt-2 text-sm text-text-secondary">
              {firstEntry ? 'Enter the same 4 digits again to confirm' : 'Choose your 4-digit PIN'}
            </p>
          </div>

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

          {firstEntry && !setPin.isPending && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 w-full"
              onClick={() => {
                setFirstEntry(null)
                setError(null)
              }}
            >
              Start again
            </Button>
          )}
        </div>

        <p className="mt-5 flex items-start justify-center gap-1.5 text-center text-xs text-text-muted">
          <KeyRound className="mt-0.5 size-3 shrink-0" />
          Forgotten it later? Sign in with your business email and reset it from the Operators
          screen.
        </p>
      </div>
    </div>
  )
}

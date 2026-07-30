import { useMemo, useState } from 'react'
import { Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/data/error-state'
import { MoneyInput } from '@/components/money/money-input'
import {
  usePermissionLimits,
  useUpsertPermissionLimit,
  useSeedPermissionLimits,
  type PermissionLimit,
} from '@/features/control/use-authorization'
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  ACTION_MEASURE,
  ALL_ACTIONS,
  CONFIGURABLE_ROLES,
  ROLE_LABELS,
} from '@/features/control/roles'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { AuthorizedAction, MemberRole } from '@/types/database'

export function SettingsPermissionsPage() {
  const { role: myRole } = useActiveBusiness()
  const isOwner = myRole === 'owner'
  const { data: limits, isLoading, isError, refetch } = usePermissionLimits()
  const seed = useSeedPermissionLimits()

  const byKey = useMemo(() => {
    const map = new Map<string, PermissionLimit>()
    for (const limit of limits ?? []) map.set(`${limit.role}:${limit.action}`, limit)
    return map
  }, [limits])

  async function handleSeed() {
    try {
      await seed.mutateAsync()
      toast({ title: 'Default limits applied' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't apply defaults",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" /> Permission limits
              </CardTitle>
              <CardDescription className="mt-1">
                How much each role can do unaided. Anything above the limit asks for a manager or
                owner PIN at the moment it happens — the action still belongs to whoever started it.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seed.isPending}>
              {seed.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Apply defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && <Skeleton className="h-64 w-full" />}
          {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

          {!isLoading && !isError && (limits ?? []).length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <p className="text-sm font-medium text-text-primary">No limits configured yet</p>
              <p className="mt-1 text-sm text-text-secondary">
                Apply the defaults to get sensible starting values, then adjust them here.
              </p>
              <Button className="mt-3" size="sm" onClick={handleSeed} disabled={seed.isPending}>
                <Sparkles className="size-3.5" /> Apply defaults
              </Button>
            </div>
          )}

          {!isLoading && !isError && (limits ?? []).length > 0 &&
            CONFIGURABLE_ROLES.map((role) => (
              <div key={role}>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">
                  {ROLE_LABELS[role]}
                </h3>
                <div className="space-y-2">
                  {ALL_ACTIONS.map((action) => (
                    <LimitRow
                      key={`${role}:${action}`}
                      role={role}
                      action={action}
                      limit={byKey.get(`${role}:${action}`)}
                      disabled={!isOwner}
                    />
                  ))}
                </div>
              </div>
            ))}

          <p className="text-xs text-text-muted">
            Owners are never limited. {!isOwner && 'Only an owner can change these values.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function LimitRow({
  role,
  action,
  limit,
  disabled,
}: {
  role: MemberRole
  action: AuthorizedAction
  limit: PermissionLimit | undefined
  disabled: boolean
}) {
  const upsert = useUpsertPermissionLimit()
  const measure = ACTION_MEASURE[action]

  const [allowed, setAllowed] = useState(limit?.allowed ?? true)
  const [value, setValue] = useState(
    measure === 'amount'
      ? (limit?.max_amount ?? '')
      : measure === 'percent'
        ? (limit?.max_percent ?? '')
        : measure === 'quantity'
          ? (limit?.max_quantity ?? '')
          : '',
  )
  const [dirty, setDirty] = useState(false)

  async function save(nextAllowed = allowed, nextValue = value) {
    try {
      await upsert.mutateAsync({
        role,
        action,
        allowed: nextAllowed,
        max_amount: measure === 'amount' ? nextValue || null : null,
        max_percent: measure === 'percent' ? nextValue || null : null,
        max_quantity: measure === 'quantity' ? nextValue || null : null,
      })
      setDirty(false)
      toast({ title: 'Limit saved' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't save limit",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{ACTION_LABELS[action]}</p>
        <p className="mt-0.5 text-xs text-text-muted">{ACTION_DESCRIPTIONS[action]}</p>
      </div>

      {measure === 'allowed' ? (
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          {allowed ? 'Allowed' : 'Needs approval'}
          <Switch
            checked={allowed}
            disabled={disabled || upsert.isPending}
            onCheckedChange={(next) => {
              setAllowed(next)
              save(next, value)
            }}
            aria-label={`${ACTION_LABELS[action]} allowed for ${ROLE_LABELS[role]}`}
          />
        </label>
      ) : (
        <>
          <div className="w-36">
            {measure === 'amount' ? (
              <MoneyInput
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setDirty(true)
                }}
                disabled={disabled}
                placeholder="No limit"
                aria-label={`${ACTION_LABELS[action]} limit for ${ROLE_LABELS[role]}`}
              />
            ) : (
              <div className="relative">
                <Input
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value)
                    setDirty(true)
                  }}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder="No limit"
                  aria-label={`${ACTION_LABELS[action]} limit for ${ROLE_LABELS[role]}`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                  {measure === 'percent' ? '%' : 'units'}
                </span>
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant={dirty ? 'default' : 'outline'}
            onClick={() => save()}
            disabled={disabled || !dirty || upsert.isPending}
          >
            {upsert.isPending ? <Loader2 className="size-3.5 animate-spin" /> : 'Save'}
          </Button>
        </>
      )}
    </div>
  )
}

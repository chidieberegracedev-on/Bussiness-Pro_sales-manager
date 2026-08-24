import { Building2, Loader2, ShoppingBasket, Shirt, UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { NotePanel } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  usePosConfig,
  useUpdatePosConfig,
  useSetBusinessVertical,
  useBusinessVertical,
  type PosConfig,
} from '@/features/pos/use-pos-config'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { BusinessVertical } from '@/types/database'

const VERTICALS: {
  value: BusinessVertical
  label: string
  body: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    value: 'general',
    label: 'General retail',
    body: 'A balanced till: images, search and scanning together.',
    icon: Building2,
  },
  {
    value: 'grocery',
    label: 'Grocery',
    body: 'Scanner-led. A dense list instead of pictures, so more lines fit.',
    icon: ShoppingBasket,
  },
  {
    value: 'boutique',
    label: 'Boutique / apparel',
    body: 'Image-led, size and colour pickers, returns and customer capture.',
    icon: Shirt,
  },
  {
    value: 'restaurant',
    label: 'Restaurant',
    body: 'Tables, open orders and per-item modifiers.',
    icon: UtensilsCrossed,
  },
]

type ToggleKey = keyof Pick<
  PosConfig,
  | 'show_product_images'
  | 'category_first'
  | 'barcode_first'
  | 'allow_hold_resume'
  | 'variants_enabled'
  | 'capture_customer'
  | 'allow_line_discount'
  | 'returns_enabled'
  | 'tables_enabled'
  | 'modifiers_enabled'
  | 'kitchen_workflow_enabled'
>

interface ToggleSpec {
  key: ToggleKey
  label: string
  body: string
  /** Set when the switch is stored but nothing reads it yet. */
  pending?: string
}

const LIVE_TOGGLES: ToggleSpec[] = [
  {
    key: 'show_product_images',
    label: 'Show product images',
    body: 'Off gives a denser till for a catalog that is mostly scanned.',
  },
  {
    key: 'category_first',
    label: 'Start from categories',
    body: 'Nothing is listed until a category is picked or something is typed.',
  },
  {
    key: 'barcode_first',
    label: 'Lead with the scanner',
    body: 'Changes what the search field asks for first.',
  },
  {
    key: 'allow_hold_resume',
    label: 'Allow holding a sale',
    body: 'Off removes Hold and Held orders from the till entirely.',
  },
  {
    key: 'variants_enabled',
    label: 'Size and colour pickers',
    body: 'Variant products open axis pickers instead of a flat list.',
  },
]

const PENDING_TOGGLES: ToggleSpec[] = [
  {
    key: 'allow_line_discount',
    label: 'Line discounts',
    pending:
      'complete_sale reads the live price server-side and takes no discount, so a discount typed here would not be charged. Needs a migration.',
    body: 'Let an operator discount a single line.',
  },
  {
    key: 'capture_customer',
    label: 'Attach a customer',
    pending: 'There is no customers table yet.',
    body: 'Record who a sale was for.',
  },
  {
    key: 'returns_enabled',
    label: 'Returns and exchanges',
    pending:
      'The inventory reversal exists (sale_reversal) but a return has no way to reference the sale it reverses. Needs a migration.',
    body: 'Take a product back against its original sale.',
  },
  {
    key: 'tables_enabled',
    label: 'Tables and dining areas',
    pending: 'Restaurant tables are not built yet.',
    body: 'Seat a table and build its order before payment.',
  },
  {
    key: 'modifiers_enabled',
    label: 'Item modifiers',
    pending: 'Modifiers are not built yet.',
    body: 'Per-item options like "no onions".',
  },
  {
    key: 'kitchen_workflow_enabled',
    label: 'Kitchen status',
    pending: 'The kitchen stream is not built yet.',
    body: 'Track an order from ordered to served.',
  },
]

/**
 * How this business's till behaves.
 *
 * The vertical is a shortcut that sets a group of switches; every switch can
 * then be changed on its own. There is one POS engine underneath — nothing
 * here forks the data model, and a business can move between types without
 * migrating anything.
 *
 * Switches whose workflow does not exist yet are shown DISABLED with the
 * reason, rather than as working controls that quietly do nothing. A flag in
 * the database is not a feature.
 */
export function SettingsPosPage() {
  const { role } = useActiveBusiness()
  const vertical = useBusinessVertical()
  const { data: config, isLoading } = usePosConfig()
  const update = useUpdatePosConfig()
  const setVertical = useSetBusinessVertical()

  const canManage = role === 'owner' || role === 'manager'

  function toggle(key: ToggleKey, next: boolean) {
    update.mutate(
      { [key]: next },
      {
        onError: (error) =>
          toast({
            variant: 'destructive',
            title: "Couldn't save that",
            description: toReadableError(error),
          }),
      },
    )
  }

  function chooseVertical(next: BusinessVertical) {
    setVertical.mutate(next, {
      onSuccess: () =>
        toast({
          title: 'Till updated',
          description: 'Open the till to see the change.',
        }),
      onError: (error) =>
        toast({
          variant: 'destructive',
          title: "Couldn't change the business type",
          description: toReadableError(error),
        }),
    })
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            What kind of business is this?
            {setVertical.isPending && <Loader2 className="size-4 animate-spin text-icon" />}
          </CardTitle>
          <CardDescription>
            Picks a starting set of till behaviours. You can change any of them below afterwards,
            and switching type never moves your products, stock or sales.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {VERTICALS.map((option) => {
            const active = vertical === option.value
            return (
              <button
                key={option.value}
                type="button"
                disabled={!canManage || setVertical.isPending}
                onClick={() => chooseVertical(option.value)}
                aria-pressed={active}
                className={cn(
                  'flex min-w-0 gap-3 rounded-2xl p-4 text-left transition-colors disabled:opacity-60',
                  active
                    ? 'bg-tint-accent ring-2 ring-accent-primary'
                    : 'bg-background hover:bg-surface-muted',
                )}
              >
                <option.icon
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    active ? 'text-accent-primary' : 'text-icon',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="type-heading block">{option.label}</span>
                  <span className="type-meta mt-0.5 block">{option.body}</span>
                </span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Till behaviour</CardTitle>
          <CardDescription>
            These take effect immediately — open the till after changing one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {LIVE_TOGGLES.map((spec) => (
            <ToggleRow
              key={spec.key}
              spec={spec}
              checked={!!config?.[spec.key]}
              disabled={!canManage}
              onChange={(next) => toggle(spec.key, next)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Not built yet</CardTitle>
          <CardDescription>
            These switches exist in the database but no workflow reads them, so they are shown
            here rather than pretending to work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {PENDING_TOGGLES.map((spec) => (
            <ToggleRow key={spec.key} spec={spec} checked={!!config?.[spec.key]} disabled />
          ))}
        </CardContent>
      </Card>

      {!canManage && (
        <NotePanel tone="neutral">
          Only an owner or manager can change how the till behaves.
        </NotePanel>
      )}
    </div>
  )
}

function ToggleRow({
  spec,
  checked,
  disabled,
  onChange,
}: {
  spec: ToggleSpec
  checked: boolean
  disabled?: boolean
  onChange?: (next: boolean) => void
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 rounded-xl px-1 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-text-primary">{spec.label}</p>
          {spec.pending && <Badge variant="muted">Coming</Badge>}
        </div>
        <p className="type-meta mt-0.5">{spec.body}</p>
        {spec.pending && <p className="type-meta mt-1 text-text-disabled">{spec.pending}</p>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange?.(next === true)}
        aria-label={spec.label}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

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
  /**
   * Which verticals this switch is worth showing for. A grocery operator
   * should not have to read past restaurant settings to find theirs; anything
   * they have deliberately turned on is still shown regardless, so a setting
   * can never become unreachable just because the business type changed.
   */
  relevantTo?: BusinessVertical[]
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
    relevantTo: ['boutique', 'general'],
  },
  {
    key: 'tables_enabled',
    label: 'Tables and dining areas',
    body: 'Replaces the basket with a floor plan: seat a table, build its order, then charge it.',
    relevantTo: ['restaurant'],
  },
  {
    key: 'modifiers_enabled',
    label: 'Item modifiers',
    body: 'Per-item options like "no onions", priced against that one line.',
    relevantTo: ['restaurant'],
  },
  {
    key: 'kitchen_workflow_enabled',
    label: 'Kitchen status',
    body: 'Track a ticket from sent through cooking, ready and served.',
    relevantTo: ['restaurant'],
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
    pending:
      'The customers table and sales.customer_id exist, but complete_sale does not accept a customer and sales carries no update policy, so the link could not be written. Waiting on the complete_sale extension.',
    body: 'Record who a sale was for.',
    relevantTo: ['boutique', 'general'],
  },
  {
    key: 'returns_enabled',
    label: 'Returns and exchanges',
    pending:
      'sales.parent_sale_id and is_return now exist, but complete_sale still refuses a negative quantity, so a return could not reverse stock or refund. Waiting on the complete_sale extension.',
    body: 'Take a product back against its original sale.',
    relevantTo: ['boutique', 'general', 'grocery'],
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

  // A switch is shown when it suits this business type, OR when it is already
  // on. Hiding something the operator deliberately enabled would strand it:
  // on, invisible, and impossible to turn off again.
  const relevant = (spec: ToggleSpec) =>
    !spec.relevantTo || spec.relevantTo.includes(vertical) || !!config?.[spec.key]

  const liveForVertical = LIVE_TOGGLES.filter(relevant)
  const pendingForVertical = PENDING_TOGGLES.filter(relevant)

  return (
    <div className="space-y-6">
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
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  'flex min-w-0 flex-col gap-2 rounded-2xl p-4 text-left transition-colors disabled:opacity-60',
                  active
                    ? 'bg-tint-accent ring-2 ring-accent-primary'
                    : 'bg-background hover:bg-surface-muted',
                )}
              >
                <option.icon
                  className={cn(
                    'size-6 shrink-0',
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

      {/* Two columns from large up. The single narrow column left most of a
          desktop settings screen empty, which reads as "there is nothing more
          here" on a page whose whole job is to show what is configurable. */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Till behaviour</CardTitle>
            <CardDescription>
              These take effect immediately — open the till after changing one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {liveForVertical.map((spec) => (
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

        <div className="space-y-6">
          {pendingForVertical.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Not built yet</CardTitle>
                <CardDescription>
                  These switches exist in the database but no workflow reads them, so they are
                  shown here rather than pretending to work.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {pendingForVertical.map((spec) => (
                  <ToggleRow key={spec.key} spec={spec} checked={!!config?.[spec.key]} disabled />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>What this till looks like now</CardTitle>
              <CardDescription>
                The shape of the selling screen these settings produce.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TillPreview config={config} vertical={vertical} />
            </CardContent>
          </Card>
        </div>
      </div>

      {!canManage && (
        <NotePanel tone="neutral">
          Only an owner or manager can change how the till behaves.
        </NotePanel>
      )}
    </div>
  )
}

/**
 * A plain-language summary of the configured till.
 *
 * Six switches do not add up to a picture of a screen in anybody's head, and
 * the cost of getting it wrong is a cashier discovering it mid-service. This
 * says what the operator will actually see, in the order they will meet it.
 */
function TillPreview({
  config,
  vertical,
}: {
  config: PosConfig | null | undefined
  vertical: BusinessVertical
}) {
  const tables = config?.tables_enabled ?? false
  const lines: string[] = tables
    ? [
        'Opens on the floor plan, not a basket.',
        'Tapping a free table seats it and opens a ticket.',
        config?.modifiers_enabled
          ? 'Each ordered item can carry options like "no onions".'
          : 'Items are ordered as they are, with no per-item options.',
        config?.kitchen_workflow_enabled
          ? 'A ticket moves through sent, cooking, ready and served.'
          : 'Tickets have no kitchen stages — they are built and charged.',
        'Charging a table goes through the same payment screen as any sale.',
      ]
    : [
        config?.category_first
          ? 'Opens on categories — nothing is listed until one is picked or something is typed.'
          : 'Opens on the full product list.',
        config?.product_view === 'list'
          ? 'Products are dense rows, so more fit on screen.'
          : 'Products are image tiles.',
        config?.show_product_images ? 'Product images are shown.' : 'No product images.',
        config?.barcode_first
          ? 'The search field asks for a barcode first.'
          : 'The search field asks for a name first.',
        config?.variants_enabled
          ? 'Variant products open size and colour pickers.'
          : 'Variant products open a flat list of options.',
        config?.allow_hold_resume
          ? 'A sale can be held and resumed later.'
          : 'Holding a sale is off — Hold and Held orders do not appear.',
      ]

  return (
    <>
      <p className="type-eyebrow mb-2">{VERTICALS.find((v) => v.value === vertical)?.label}</p>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line} className="type-body flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-icon-muted" />
            {line}
          </li>
        ))}
      </ul>
    </>
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

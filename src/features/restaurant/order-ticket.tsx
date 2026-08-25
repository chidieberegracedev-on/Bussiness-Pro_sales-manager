import { useState } from 'react'
import Decimal from 'decimal.js'
import {
  ChefHat,
  Loader2,
  Minus,
  Package,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import {
  ORDER_STATE_LABELS,
  SERVICE_MODE_LABELS,
  nextKitchenState,
  useRemoveOrderItem,
  useSetItemQuantity,
  useSetOrderState,
  useUpdateOrder,
  type RestaurantOrder,
  type ServiceMode,
} from '@/features/restaurant/use-restaurant'
import { ModifierPicker } from '@/features/restaurant/modifier-picker'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

const MODES: ServiceMode[] = ['dine_in', 'takeaway', 'delivery']

/**
 * The ticket for one table.
 *
 * It is a view over `restaurant_orders`, not local state: two servers can be
 * looking at the same table, the order outlives a page reload, and the kitchen
 * reads the same rows. Every control here writes to the server and lets the
 * query refetch — an optimistic local copy of a shared object is how two
 * servers end up each believing a different thing about table six.
 */
export function OrderTicket({
  order,
  onClose,
  onCharge,
  chargePending,
}: {
  order: RestaurantOrder
  onClose: () => void
  onCharge: () => void
  chargePending?: boolean
}) {
  const setQuantity = useSetItemQuantity()
  const removeItem = useRemoveOrderItem()
  const setOrderState = useSetOrderState()
  const updateOrder = useUpdateOrder()
  const [modifierFor, setModifierFor] = useState<string | null>(null)

  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    order.items.map((i) => i.image_path),
  )

  const advance = nextKitchenState(order.state)
  const empty = order.items.length === 0
  // A ticket that has not been sent is still being built; one that has can be
  // paid. Charging a ticket the kitchen never saw is the mistake worth
  // preventing, so Send comes first and Charge takes over once it has gone.
  const sent = order.state !== 'open'

  function fail(error: unknown, title: string) {
    toast({ variant: 'destructive', title, description: toReadableError(error) })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="type-eyebrow">Order details</p>
            <h2 className="truncate text-lg font-bold text-text-primary">
              {order.table_label
                ? `Table ${order.table_label}`
                : SERVICE_MODE_LABELS[order.service_mode]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close this ticket"
            className="rounded-lg p-1.5 text-icon-muted transition-colors hover:bg-surface-muted hover:text-icon-strong"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Dine in / Takeaway / Delivery. Changing it does not clear the
            ticket — a table that decides to take it away keeps its food. */}
        <div className="mt-3 flex rounded-xl bg-background p-1">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                updateOrder.mutate(
                  {
                    orderId: order.id,
                    service_mode: mode,
                    // Leaving the table attached to a takeaway would keep the
                    // table shown as occupied by an order that walked out.
                    table_id: mode === 'dine_in' ? order.table_id : null,
                  },
                  { onError: (e) => fail(e, "Couldn't change the order type") },
                )
              }
              aria-pressed={order.service_mode === mode}
              className={cn(
                'flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors',
                order.service_mode === mode
                  ? 'bg-surface text-text-primary shadow-e1'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {SERVICE_MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="type-meta flex items-center gap-1.5" htmlFor="guest-count">
            <Users className="size-3.5" aria-hidden /> Guests
          </label>
          <Input
            id="guest-count"
            type="number"
            min={1}
            defaultValue={order.guest_count ?? ''}
            onBlur={(e) => {
              const value = e.target.value.trim()
              const next = value ? Number(value) : null
              if (next === order.guest_count) return
              updateOrder.mutate(
                { orderId: order.id, guest_count: next && next > 0 ? next : null },
                { onError: (err) => fail(err, "Couldn't save the guest count") },
              )
            }}
            className="h-9 w-20"
          />
          <span
            className={cn(
              'ml-auto rounded-full px-2.5 py-1 text-xs font-bold',
              sent ? 'bg-tint-info text-tint-info-foreground' : 'bg-surface-muted text-text-secondary',
            )}
          >
            {ORDER_STATE_LABELS[order.state]}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {empty ? (
          <div className="py-10 text-center">
            <p className="type-body">Nothing ordered yet.</p>
            <p className="type-meta mt-1">Pick from the menu to build this ticket.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {order.items.map((item) => {
              const url = item.image_path ? imageUrls?.get(item.image_path) : undefined
              const qty = new Decimal(item.quantity)
              return (
                <li key={item.id} className="rounded-2xl bg-background p-2.5">
                  <div className="flex gap-2.5">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/50">
                      {url ? (
                        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="size-4 text-tint-accent-foreground/40" aria-hidden />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {item.product_name}
                      </p>
                      {item.variant_name && <p className="type-meta truncate">{item.variant_name}</p>}
                      {item.modifiers.length > 0 && (
                        <p className="type-meta truncate">
                          {item.modifiers.map((m) => m.label).join(' · ')}
                        </p>
                      )}
                      {item.note && <p className="type-meta italic truncate">“{item.note}”</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeItem.mutate(item.id, {
                          onError: (e) => fail(e, "Couldn't remove that item"),
                        })
                      }
                      aria-label={`Remove ${item.product_name}`}
                      className="h-fit rounded-lg p-1.5 text-icon-muted transition-colors hover:bg-tint-danger hover:text-tint-danger-foreground"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setModifierFor(item.id)}
                      className="type-meta rounded-lg px-2 py-1 font-semibold text-accent-primary transition-colors hover:bg-tint-accent"
                    >
                      {item.modifiers.length > 0 ? 'Edit options' : '+ Options'}
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-text-primary">
                        <Money value={item.line_total} />
                      </span>
                      <div className="flex items-center gap-1 rounded-full bg-surface p-1">
                        <StepButton
                          label={`One less ${item.product_name}`}
                          onClick={() =>
                            setQuantity.mutate(
                              { itemId: item.id, quantity: qty.minus(1).toString() },
                              { onError: (e) => fail(e, "Couldn't change the quantity") },
                            )
                          }
                        >
                          <Minus className="size-3.5" />
                        </StepButton>
                        <span className="min-w-6 text-center text-sm font-bold tabular-nums text-text-primary">
                          {qty.toString()}
                        </span>
                        <StepButton
                          label={`One more ${item.product_name}`}
                          onClick={() =>
                            setQuantity.mutate(
                              { itemId: item.id, quantity: qty.plus(1).toString() },
                              { onError: (e) => fail(e, "Couldn't change the quantity") },
                            )
                          }
                        >
                          <Plus className="size-3.5" />
                        </StepButton>
                      </div>
                    </div>
                  </div>

                  {modifierFor === item.id && (
                    <ModifierPicker
                      item={item}
                      onDone={() => setModifierFor(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <footer className="shrink-0 space-y-3 border-t border-border px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="type-body font-semibold">Total</span>
          <span className="text-xl font-bold tabular-nums text-text-primary">
            <Money value={order.subtotal} />
          </span>
        </div>
        <p className="type-meta">
          Tax and any discount are applied at payment, where the sale is priced server-side.
        </p>

        <div className="flex gap-2">
          {advance && (
            <Button
              variant={order.state === 'open' ? 'default' : 'outline'}
              className="flex-1"
              disabled={empty || setOrderState.isPending}
              onClick={() =>
                setOrderState.mutate(
                  { orderId: order.id, state: advance },
                  { onError: (e) => fail(e, "Couldn't update the kitchen status") },
                )
              }
            >
              {setOrderState.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : order.state === 'open' ? (
                <Send className="size-4" />
              ) : (
                <ChefHat className="size-4" />
              )}
              {order.state === 'open' ? 'Send to kitchen' : `Mark ${ORDER_STATE_LABELS[advance].toLowerCase()}`}
            </Button>
          )}
        </div>

        <Button
          size="lg"
          variant={sent ? 'default' : 'outline'}
          className="h-14 w-full text-base"
          disabled={empty || chargePending}
          onClick={onCharge}
        >
          {chargePending && <Loader2 className="size-4 animate-spin" />}
          Charge <Money value={order.subtotal} />
        </Button>
      </footer>
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
    >
      {children}
    </button>
  )
}

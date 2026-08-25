import { Clock, Utensils } from 'lucide-react'
import { Money } from '@/components/money/money'
import {
  ORDER_STATE_LABELS,
  SERVICE_MODE_LABELS,
  type OrderState,
  type RestaurantOrder,
} from '@/features/restaurant/use-restaurant'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATE_TONE: Record<OrderState, string> = {
  open: 'bg-surface-muted text-text-secondary',
  sent: 'bg-tint-info text-tint-info-foreground',
  preparing: 'bg-tint-warning text-tint-warning-foreground',
  ready: 'bg-tint-success text-tint-success-foreground',
  served: 'bg-tint-accent text-tint-accent-foreground',
  closed: 'bg-surface-muted text-text-muted',
  cancelled: 'bg-tint-danger text-tint-danger-foreground',
}

/**
 * The order queue — every ticket currently on the floor, oldest first.
 *
 * Oldest first is the whole point: the order that has been waiting longest is
 * the one about to become a complaint, so it must be the one nearest the eye.
 * Sorting by table number instead would bury it.
 */
export function OrderQueues({
  orders,
  activeOrderId,
  onOpen,
}: {
  orders: RestaurantOrder[]
  activeOrderId: string | null
  onOpen: (order: RestaurantOrder) => void
}) {
  const { business } = useActiveBusiness()
  const locale = useLocale()

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-5 text-center">
        <p className="type-body">Nothing on the floor right now.</p>
        <p className="type-meta mt-0.5">Seat a table below to open the first ticket.</p>
      </div>
    )
  }

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {orders.map((order) => {
        const active = order.id === activeOrderId
        return (
          <button
            key={order.id}
            type="button"
            onClick={() => onOpen(order)}
            className={cn(
              'flex w-60 shrink-0 flex-col gap-2 rounded-2xl border bg-surface p-3.5 text-left shadow-e1 transition-all',
              active ? 'border-accent-primary ring-2 ring-accent-primary' : 'border-border hover:shadow-e2',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs font-semibold text-text-muted">
                #{order.id.slice(0, 8)}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold',
                  STATE_TONE[order.state],
                )}
              >
                {ORDER_STATE_LABELS[order.state]}
              </span>
            </span>

            <span className="block truncate text-sm font-semibold text-text-primary">
              {order.table_label
                ? `Table ${order.table_label}`
                : SERVICE_MODE_LABELS[order.service_mode]}
              {order.opened_by_name && (
                <span className="type-meta ml-1.5 font-medium">· {order.opened_by_name}</span>
              )}
            </span>

            <span className="type-meta flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {business ? formatDateTime(order.opened_at, business.timezone, locale) : '—'}
            </span>

            <span className="flex items-center justify-between gap-2 border-t border-border pt-2">
              <span className="type-meta flex items-center gap-1">
                <Utensils className="size-3.5" aria-hidden />
                {order.item_count} item{order.item_count === 1 ? '' : 's'}
              </span>
              <span className="text-sm font-bold tabular-nums text-text-primary">
                <Money value={order.subtotal} />
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

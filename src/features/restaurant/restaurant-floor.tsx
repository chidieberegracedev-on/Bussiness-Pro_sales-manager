import { useCallback, useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/data/error-state'
import { PosProductGrid } from '@/features/pos/pos-product-grid'
import { ProductSinkProvider, type ProductSink } from '@/features/pos/product-sink'
import { PaymentDialog } from '@/features/pos/payment-dialog'
import { useCartStore } from '@/features/pos/cart-store'
import { OrderQueues } from '@/features/restaurant/order-queues'
import { FloorPlan } from '@/features/restaurant/floor-plan'
import { OrderTicket } from '@/features/restaurant/order-ticket'
import {
  useAddOrderItem,
  useCloseOrder,
  useOpenOrder,
  useOpenOrders,
  useSetItemQuantity,
  type RestaurantOrder,
  type ServiceMode,
} from '@/features/restaurant/use-restaurant'
import { useOpenShift } from '@/features/finance/use-shifts'
import { useDefaultLocation } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * The restaurant selling surface.
 *
 * A restaurant till is not a retail till with different colours. The unit of
 * work is a TABLE, not a basket: an order is opened when people sit down,
 * added to over an hour, seen by the kitchen, and only becomes money at the
 * end. So the floor comes first and the menu second — the opposite of a shop,
 * where the catalogue is the whole screen.
 *
 * Everything underneath is unchanged. The menu is the same product browser
 * every other vertical uses, plugged into a different sink; and closing a table
 * goes through `complete_sale` exactly like every other sale in the system.
 */
export function RestaurantFloor({ showImages = true }: { showImages?: boolean }) {
  const { data: orders, isLoading, isError, refetch } = useOpenOrders()
  const { data: location } = useDefaultLocation()
  const { data: openShift } = useOpenShift(location?.id)

  const openOrder = useOpenOrder()
  const addItem = useAddOrderItem()
  const setItemQuantity = useSetItemQuantity()
  const closeOrder = useCloseOrder()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  const setLines = useCartStore((s) => s.setLines)
  const resetCart = useCartStore((s) => s.reset)

  const active = useMemo(
    () => (orders ?? []).find((o) => o.id === activeId) ?? null,
    [orders, activeId],
  )

  function fail(error: unknown, title: string) {
    toast({ variant: 'destructive', title, description: toReadableError(error) })
  }

  function handleOpenTable(tableId: string, existing: RestaurantOrder | undefined) {
    if (existing) {
      setActiveId(existing.id)
      return
    }
    openOrder.mutate(
      { tableId, serviceMode: 'dine_in', shiftId: openShift?.id ?? null },
      {
        onSuccess: (created) => setActiveId(created.id),
        onError: (error) => fail(error, "Couldn't seat that table"),
      },
    )
  }

  function handleWalkIn(mode: ServiceMode) {
    openOrder.mutate(
      { tableId: null, serviceMode: mode, shiftId: openShift?.id ?? null },
      {
        onSuccess: (created) => setActiveId(created.id),
        onError: (error) => fail(error, "Couldn't start that order"),
      },
    )
  }

  /**
   * The menu writes to the OPEN ORDER, not to the cart.
   *
   * Quantities read back from the server copy, so two servers working the same
   * table see the same ticket. `unit_price` is snapshotted on the way in: a
   * menu price change mid-service must not silently reprice a table that has
   * already ordered.
   */
  const sink = useMemo<ProductSink>(() => {
    const items = active?.items ?? []
    return {
      quantityOf: (variantId) =>
        items
          .filter((i) => i.variant_id === variantId)
          .reduce((sum, i) => sum.plus(new Decimal(i.quantity)), new Decimal(0)),
      add: (entry) => {
        if (!active) return
        const existing = items.find(
          (i) => i.variant_id === entry.variantId && i.modifiers.length === 0,
        )
        // A line that already carries modifiers is a different dish now, so a
        // second plain one starts its own line rather than joining it.
        if (existing) {
          setItemQuantity.mutate(
            { itemId: existing.id, quantity: new Decimal(existing.quantity).plus(1).toString() },
            { onError: (e) => fail(e, "Couldn't add that item") },
          )
          return
        }
        addItem.mutate(
          {
            orderId: active.id,
            variantId: entry.variantId,
            quantity: '1',
            unitPrice: entry.unitPrice.toFixed(4),
          },
          { onError: (e) => fail(e, "Couldn't add that item") },
        )
      },
      setQuantity: (variantId, quantity) => {
        const existing = items.find(
          (i) => i.variant_id === variantId && i.modifiers.length === 0,
        )
        if (!existing) return
        setItemQuantity.mutate(
          { itemId: existing.id, quantity: quantity.toString() },
          { onError: (e) => fail(e, "Couldn't change the quantity") },
        )
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, addItem, setItemQuantity])

  /**
   * Charging loads the ticket into the cart and opens the ORDINARY payment
   * dialog. There is no second checkout: the same `complete_sale`, the same
   * split payments, the same receipt. The order is then closed against the
   * sale that settled it.
   */
  const handleCharge = useCallback(() => {
    if (!active || active.items.length === 0) return
    resetCart()
    setLines(
      active.items.map((item) => ({
        // A fresh movement id per line, exactly as the cart mints one: it is
        // the idempotency key complete_sale uses for the stock movement, and
        // reusing the order item's id would collide if a table is re-charged
        // after a failed first attempt.
        movementId: crypto.randomUUID(),
        variantId: item.variant_id,
        productName: item.product_name,
        variantName:
          item.modifiers.length > 0
            ? [item.variant_name, item.modifiers.map((m) => m.label).join(', ')]
                .filter(Boolean)
                .join(' · ')
            : item.variant_name,
        baseUnit: 'each',
        unitPrice: new Decimal(item.unit_price),
        quantity: new Decimal(item.quantity),
        imagePath: item.image_path,
      })),
    )
    setPaying(true)
  }, [active, resetCart, setLines])

  if (isError) {
    return (
      <div className="p-6">
        <ErrorState error={new Error('load')} onRetry={() => refetch()} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 space-y-3 px-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="type-heading">Order queue</h2>
            {active && (
              <Button size="sm" variant="outline" onClick={() => setActiveId(null)}>
                <LayoutGrid className="size-4" /> Floor plan
              </Button>
            )}
          </div>
          <OrderQueues
            orders={orders ?? []}
            activeOrderId={activeId}
            onOpen={(order) => setActiveId(order.id)}
          />
        </div>

        {active ? (
          // The menu, plugged into this table's ticket.
          <ProductSinkProvider sink={sink}>
            <div className="min-h-0 flex-1">
              <PosProductGrid showImages={showImages} view="grid" categoryFirst={false} barcodeFirst={false} />
            </div>
          </ProductSinkProvider>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <FloorPlan
              orders={orders ?? []}
              onOpenTable={handleOpenTable}
              onStartWalkIn={handleWalkIn}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>

      {/* The ticket. On a narrow screen the floor and the ticket take turns
          rather than shrinking each other into uselessness. */}
      {active && (
        <aside className="hidden w-[22rem] shrink-0 border-l border-border lg:block">
          <OrderTicket
            order={active}
            onClose={() => setActiveId(null)}
            onCharge={handleCharge}
            chargePending={closeOrder.isPending}
          />
        </aside>
      )}

      {active && (
        <div className="fixed inset-0 z-40 flex flex-col bg-surface lg:hidden">
          <div className="shrink-0 border-b border-border p-2">
            <Button size="sm" variant="ghost" onClick={() => setActiveId(null)}>
              <ArrowLeft className="size-4" /> Floor plan
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <OrderTicket
              order={active}
              onClose={() => setActiveId(null)}
              onCharge={handleCharge}
              chargePending={closeOrder.isPending}
            />
          </div>
        </div>
      )}

      <PaymentDialog
        open={paying}
        onOpenChange={setPaying}
        onCompleted={(sale) => {
          if (!active) return
          closeOrder.mutate(
            { orderId: active.id, saleId: sale.id },
            {
              onSuccess: () => setActiveId(null),
              // The money is already taken — say what is actually wrong rather
              // than implying the payment failed.
              onError: (error) =>
                fail(error, 'Paid, but the table could not be cleared. Close it from the queue.'),
            },
          )
        }}
      />
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'

export type TableState = 'available' | 'seated' | 'ordering' | 'served' | 'bill' | 'cleaning'
export type OrderState = 'open' | 'sent' | 'preparing' | 'ready' | 'served' | 'closed' | 'cancelled'
export type ServiceMode = 'dine_in' | 'takeaway' | 'delivery'

export interface DiningArea {
  id: string
  name: string
  sort_order: number
}

export interface DiningTable {
  id: string
  area_id: string | null
  label: string
  seats: number
  sort_order: number
}

export interface OrderModifier {
  id: string
  label: string
  price_delta: string
}

export interface OrderItem {
  id: string
  variant_id: string
  quantity: string
  unit_price: string
  state: OrderState
  note: string | null
  created_at: string
  product_name: string
  variant_name: string | null
  image_path: string | null
  modifiers: OrderModifier[]
  /** (unit_price + modifier deltas) × quantity. */
  line_total: string
}

export interface RestaurantOrder {
  id: string
  table_id: string | null
  table_label: string | null
  service_mode: ServiceMode
  state: OrderState
  guest_count: number | null
  note: string | null
  opened_at: string
  opened_by: string | null
  opened_by_name: string | null
  items: OrderItem[]
  item_count: number
  subtotal: string
}

/**
 * Table state is DERIVED from the table's open order, never stored twice.
 *
 * `dining_tables.state` exists in the schema, but a stored state and a live
 * order are two sources of truth for the same fact and they drift the moment
 * anything fails halfway: a table reading "available" with an unpaid order on
 * it is worse than no floor plan at all. The column stays for `cleaning`, which
 * is the one state no order can express — a table that has been paid and
 * vacated but is not yet ready to seat.
 */
export function deriveTableState(order: RestaurantOrder | undefined, stored: TableState): TableState {
  if (!order) return stored === 'cleaning' ? 'cleaning' : 'available'
  switch (order.state) {
    case 'open':
      return order.items.length === 0 ? 'seated' : 'ordering'
    case 'sent':
    case 'preparing':
      return 'ordering'
    case 'ready':
    case 'served':
      return 'served'
    default:
      return 'available'
  }
}

export const ORDER_STATE_LABELS: Record<OrderState, string> = {
  open: 'Building',
  sent: 'Sent to kitchen',
  preparing: 'Cooking',
  ready: 'Ready to serve',
  served: 'Served',
  closed: 'Paid',
  cancelled: 'Cancelled',
}

export const TABLE_STATE_LABELS: Record<TableState, string> = {
  available: 'Free',
  seated: 'Seated',
  ordering: 'Ordering',
  served: 'Served',
  bill: 'Bill requested',
  cleaning: 'Cleaning',
}

export const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  dine_in: 'Dine in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
}

/** The states an order passes through, in order, for the "advance" control. */
export const KITCHEN_FLOW: OrderState[] = ['open', 'sent', 'preparing', 'ready', 'served']

export function nextKitchenState(state: OrderState): OrderState | null {
  const i = KITCHEN_FLOW.indexOf(state)
  if (i === -1 || i === KITCHEN_FLOW.length - 1) return null
  return KITCHEN_FLOW[i + 1]
}

export function useDiningAreas() {
  const { business } = useActiveBusiness()
  return useQuery({
    queryKey: ['dining-areas', business?.id],
    queryFn: async (): Promise<DiningArea[]> => {
      const { data, error } = await supabase
        .from('dining_areas')
        .select('id, name, sort_order')
        .eq('business_id', business!.id)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as DiningArea[]
    },
    enabled: !!business,
  })
}

export function useDiningTables() {
  const { business } = useActiveBusiness()
  return useQuery({
    queryKey: ['dining-tables', business?.id],
    queryFn: async (): Promise<Array<DiningTable & { stored_state: TableState }>> => {
      const { data, error } = await supabase
        .from('dining_tables')
        .select('id, area_id, label, seats, sort_order, state')
        .eq('business_id', business!.id)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as Array<DiningTable & { state: TableState }>).map((t) => ({
        id: t.id,
        area_id: t.area_id,
        label: t.label,
        seats: t.seats,
        sort_order: t.sort_order,
        stored_state: t.state,
      }))
    },
    enabled: !!business,
  })
}

function lineTotal(unitPrice: string, quantity: string, modifiers: OrderModifier[]): string {
  const perUnit = modifiers.reduce(
    (sum, m) => sum.plus(new Decimal(m.price_delta)),
    new Decimal(unitPrice),
  )
  return perUnit.times(new Decimal(quantity)).toFixed(4)
}

/**
 * Every order that is still on the floor, with its items and modifiers.
 *
 * One query per table rather than a nested select: the modifier rows hang off
 * order items which hang off orders, and PostgREST's embedding would need the
 * whole chain to be traversable in one direction. Three flat reads and a join
 * in memory is both simpler to reason about and cheaper than the alternative
 * everyone reaches for, which is refetching per open order.
 */
export function useOpenOrders() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['restaurant-orders', business?.id],
    queryFn: async (): Promise<RestaurantOrder[]> => {
      const { data: orders, error } = await supabase
        .from('restaurant_orders')
        .select(
          'id, table_id, service_mode, state, guest_count, note, opened_at, opened_by, dining_tables(label)',
        )
        .eq('business_id', business!.id)
        .not('state', 'in', '(closed,cancelled)')
        .order('opened_at', { ascending: true })
      if (error) throw error

      // Relationships are left empty in the hand-authored types, so an
      // embedded select is cast at the call site (see database.ts header).
      const rows = (orders ?? []) as unknown as Array<{
        id: string
        table_id: string | null
        service_mode: ServiceMode
        state: OrderState
        guest_count: number | null
        note: string | null
        opened_at: string
        opened_by: string | null
        dining_tables: { label: string } | null
      }>
      if (rows.length === 0) return []

      const orderIds = rows.map((o) => o.id)

      const [{ data: items }, { data: members }] = await Promise.all([
        supabase
          .from('restaurant_order_items')
          .select(
            'id, order_id, variant_id, quantity, unit_price, state, note, created_at, product_variants(variant_name, products(name, image_path))',
          )
          .in('order_id', orderIds)
          .order('created_at', { ascending: true }),
        supabase
          .from('business_members')
          .select('id, display_name')
          .eq('business_id', business!.id),
      ])

      const itemRows = (items ?? []) as unknown as Array<{
        id: string
        order_id: string
        variant_id: string
        quantity: string
        unit_price: string
        state: OrderState
        note: string | null
        created_at: string
        product_variants: {
          variant_name: string | null
          products: { name: string; image_path: string | null } | null
        } | null
      }>

      const itemIds = itemRows.map((i) => i.id)
      const { data: modifiers } = itemIds.length
        ? await supabase
            .from('restaurant_order_item_modifiers')
            .select('id, order_item_id, label, price_delta')
            .in('order_item_id', itemIds)
        : { data: [] }

      const modsByItem = new Map<string, OrderModifier[]>()
      for (const m of (modifiers ?? []) as unknown as Array<
        OrderModifier & { order_item_id: string }
      >) {
        const list = modsByItem.get(m.order_item_id) ?? []
        list.push({ id: m.id, label: m.label, price_delta: m.price_delta })
        modsByItem.set(m.order_item_id, list)
      }

      const nameByMember = new Map(
        ((members ?? []) as unknown as Array<{ id: string; display_name: string | null }>).map((m) => [
          m.id,
          m.display_name,
        ]),
      )

      return rows.map((order) => {
        const mine = itemRows
          .filter((i) => i.order_id === order.id)
          .map((i): OrderItem => {
            const mods = modsByItem.get(i.id) ?? []
            return {
              id: i.id,
              variant_id: i.variant_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
              state: i.state,
              note: i.note,
              created_at: i.created_at,
              product_name: i.product_variants?.products?.name ?? 'Item',
              variant_name: i.product_variants?.variant_name ?? null,
              image_path: i.product_variants?.products?.image_path ?? null,
              modifiers: mods,
              line_total: lineTotal(i.unit_price, i.quantity, mods),
            }
          })

        return {
          id: order.id,
          table_id: order.table_id,
          table_label: order.dining_tables?.label ?? null,
          service_mode: order.service_mode,
          state: order.state,
          guest_count: order.guest_count,
          note: order.note,
          opened_at: order.opened_at,
          opened_by: order.opened_by,
          opened_by_name: order.opened_by ? (nameByMember.get(order.opened_by) ?? null) : null,
          items: mine,
          item_count: mine.length,
          subtotal: mine
            .reduce((sum, i) => sum.plus(new Decimal(i.line_total)), new Decimal(0))
            .toFixed(4),
        }
      })
    },
    enabled: !!business,
    // A floor changes under you: another server seats a table, the kitchen
    // marks a dish ready. Polling keeps the map honest without a realtime
    // subscription this build does not yet have.
    refetchInterval: 20_000,
    staleTime: 5_000,
  })
}

export function useModifierOptions() {
  const { business } = useActiveBusiness()
  return useQuery({
    queryKey: ['modifier-options', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modifier_options')
        .select('id, group_name, label, price_delta, sort_order')
        .eq('business_id', business!.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        id: string
        group_name: string
        label: string
        price_delta: string
        sort_order: number
      }>
    },
    enabled: !!business,
  })
}

function useInvalidateOrders() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['restaurant-orders', business?.id] })
    qc.invalidateQueries({ queryKey: ['dining-tables', business?.id] })
  }
}

export function useOpenOrder() {
  const { business, membership } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const invalidate = useInvalidateOrders()

  return useMutation({
    mutationFn: async (input: {
      tableId?: string | null
      serviceMode: ServiceMode
      guestCount?: number | null
      shiftId?: string | null
    }) => {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .insert({
          business_id: business!.id,
          location_id: location!.id,
          table_id: input.tableId ?? null,
          service_mode: input.serviceMode,
          guest_count: input.guestCount ?? null,
          opened_by: membership?.id ?? null,
          shift_id: input.shiftId ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      return data as unknown as { id: string }
    },
    onSuccess: invalidate,
  })
}

export function useAddOrderItem() {
  const { business } = useActiveBusiness()
  const invalidate = useInvalidateOrders()

  return useMutation({
    mutationFn: async (input: {
      orderId: string
      variantId: string
      quantity: string
      /** Snapshotted at order time so a mid-service price change cannot
          silently reprice a table that already ordered. */
      unitPrice: string
      note?: string | null
      modifiers?: Array<{ label: string; price_delta: string }>
    }) => {
      const { data, error } = await supabase
        .from('restaurant_order_items')
        .insert({
          order_id: input.orderId,
          business_id: business!.id,
          variant_id: input.variantId,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          note: input.note ?? null,
        })
        .select('id')
        .single()
      if (error) throw error

      const item = data as unknown as { id: string }
      if (input.modifiers?.length) {
        const { error: modError } = await supabase
          .from('restaurant_order_item_modifiers')
          .insert(
            input.modifiers.map((m) => ({
              order_item_id: item.id,
              business_id: business!.id,
              label: m.label,
              price_delta: m.price_delta,
            })),
          )
        if (modError) throw modError
      }
      return item
    },
    onSuccess: invalidate,
  })
}

export function useSetItemQuantity() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: string }) => {
      // Zero is a removal, not a quantity: the check constraint is quantity > 0
      // and an item nobody ordered should not sit on the ticket at all.
      if (new Decimal(quantity).lte(0)) {
        const { error } = await supabase.from('restaurant_order_items').delete().eq('id', itemId)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('restaurant_order_items')
        .update({ quantity })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRemoveOrderItem() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('restaurant_order_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetOrderState() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async ({ orderId, state }: { orderId: string; state: OrderState }) => {
      const { error } = await supabase
        .from('restaurant_orders')
        .update({ state })
        .eq('id', orderId)
      if (error) throw error
      // Items follow the order they belong to: a ticket that went to the
      // kitchen sent every line on it, not some of them.
      const { error: itemError } = await supabase
        .from('restaurant_order_items')
        .update({ state })
        .eq('order_id', orderId)
      if (itemError) throw itemError
    },
    onSuccess: invalidate,
  })
}

export function useUpdateOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async ({
      orderId,
      ...patch
    }: {
      orderId: string
      service_mode?: ServiceMode
      table_id?: string | null
      guest_count?: number | null
      note?: string | null
    }) => {
      const { error } = await supabase.from('restaurant_orders').update(patch).eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/**
 * Close an order against the sale it produced.
 *
 * An order is not revenue — the sale it produced is. `complete_sale` stays the
 * only thing that moves stock and money; this records which sale settled the
 * order and takes it off the floor. Called only after complete_sale returns.
 */
export function useCloseOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async ({ orderId, saleId }: { orderId: string; saleId: string }) => {
      const { error } = await supabase
        .from('restaurant_orders')
        .update({ state: 'closed', sale_id: saleId, closed_at: new Date().toISOString() })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCancelOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('restaurant_orders')
        .update({ state: 'cancelled', closed_at: new Date().toISOString() })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Move an order to another table, keeping every item and modifier with it. */
export function useTransferTable() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: async ({ orderId, tableId }: { orderId: string; tableId: string }) => {
      const { error } = await supabase
        .from('restaurant_orders')
        .update({ table_id: tableId })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

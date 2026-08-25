import { useMemo, useState } from 'react'
import { Armchair, Bike, ShoppingBag, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useDiningAreas,
  useDiningTables,
  deriveTableState,
  ORDER_STATE_LABELS,
  TABLE_STATE_LABELS,
  type RestaurantOrder,
  type ServiceMode,
  type TableState,
} from '@/features/restaurant/use-restaurant'
import { cn } from '@/lib/utils'

/**
 * A table's colour has to be readable across the room, not studied up close —
 * a server glancing at the floor should see where the pressure is without
 * reading a single word. Each state therefore differs in fill AND border, so
 * the map still works for someone who cannot separate the hues.
 */
const TABLE_TONE: Record<TableState, string> = {
  available: 'bg-surface border-border text-text-secondary hover:border-accent-primary',
  seated: 'bg-tint-info border-tint-info-foreground/30 text-tint-info-foreground',
  ordering: 'bg-tint-warning border-tint-warning-foreground/35 text-tint-warning-foreground',
  served: 'bg-tint-success border-tint-success-foreground/30 text-tint-success-foreground',
  bill: 'bg-tint-accent border-accent-primary text-tint-accent-foreground',
  cleaning: 'bg-surface-muted border-dashed border-border-strong text-text-muted',
}

export function FloorPlan({
  orders,
  onOpenTable,
  onStartWalkIn,
  isLoading,
}: {
  orders: RestaurantOrder[]
  onOpenTable: (tableId: string, existing: RestaurantOrder | undefined) => void
  onStartWalkIn: (mode: ServiceMode) => void
  isLoading?: boolean
}) {
  const { data: areas } = useDiningAreas()
  const { data: tables, isLoading: tablesLoading } = useDiningTables()
  const [areaId, setAreaId] = useState<string | 'all'>('all')

  const orderByTable = useMemo(() => {
    const map = new Map<string, RestaurantOrder>()
    for (const order of orders) if (order.table_id) map.set(order.table_id, order)
    return map
  }, [orders])

  const visible = (tables ?? []).filter((t) => areaId === 'all' || t.area_id === areaId)

  if (tablesLoading || isLoading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onStartWalkIn('takeaway')}>
          <ShoppingBag className="size-4" /> New takeaway
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStartWalkIn('delivery')}>
          <Bike className="size-4" /> New delivery
        </Button>
      </div>

      {areas && areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <AreaChip active={areaId === 'all'} onClick={() => setAreaId('all')}>
            All areas
          </AreaChip>
          {areas.map((area) => (
            <AreaChip key={area.id} active={areaId === area.id} onClick={() => setAreaId(area.id)}>
              {area.name}
            </AreaChip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Armchair}
          title={tables && tables.length > 0 ? 'No tables in this area' : 'No tables set up yet'}
          description={
            tables && tables.length > 0
              ? 'Pick another area, or start a takeaway order above.'
              : 'A manager can add dining areas and tables in Settings → Floor plan. Takeaway and delivery orders work without them.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((table) => {
            const order = orderByTable.get(table.id)
            const state = deriveTableState(order, table.stored_state)
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => onOpenTable(table.id, order)}
                className={cn(
                  'flex min-h-28 flex-col items-start justify-between rounded-2xl border-2 p-3.5 text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  TABLE_TONE[state],
                )}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="text-lg font-bold leading-none">{table.label}</span>
                  <span className="type-meta flex items-center gap-1 leading-none">
                    <Armchair className="size-3.5" aria-hidden />
                    {table.seats}
                  </span>
                </span>
                <span className="w-full">
                  {/* An occupied table shows what its ORDER is doing —
                      "Cooking" is what the server needs to know, and the
                      coarser table state cannot say it. A free table has no
                      order, so it shows its own state. */}
                  <span className="block text-xs font-semibold uppercase tracking-wide">
                    {order ? ORDER_STATE_LABELS[order.state] : TABLE_STATE_LABELS[state]}
                  </span>
                  {order ? (
                    <span className="mt-0.5 block text-sm font-bold tabular-nums">
                      <Money value={order.subtotal} />
                      <span className="type-meta ml-1.5 font-medium">
                        {order.item_count} item{order.item_count === 1 ? '' : 's'}
                      </span>
                    </span>
                  ) : (
                    <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold opacity-70">
                      <Plus className="size-3.5" /> Seat
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AreaChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
        active
          ? 'bg-accent-primary text-primary-foreground'
          : 'bg-surface text-text-secondary hover:bg-surface-muted',
      )}
    >
      {children}
    </button>
  )
}

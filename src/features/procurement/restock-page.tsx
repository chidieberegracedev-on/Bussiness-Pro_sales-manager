import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, TrendingDown, AlertTriangle, Loader2, Info } from 'lucide-react'
import Decimal from 'decimal.js'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState, PermissionDeniedState } from '@/components/data/error-state'
import {
  useRestockSuggestions,
  groupBySupplier,
  type RestockSuggestion,
} from '@/features/procurement/use-restock'
import { useCreatePurchaseOrder } from '@/features/procurement/use-purchase-orders'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface RowState {
  selected: boolean
  qtyPurchase: string
}

export function RestockPage() {
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const canCreate = role === 'owner' || role === 'manager'

  const { data: suggestions, isLoading, isError, refetch } = useRestockSuggestions()
  const createPo = useCreatePurchaseOrder()

  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [creatingSupplierId, setCreatingSupplierId] = useState<string | null>(null)

  const groups = useMemo(() => (suggestions ? groupBySupplier(suggestions) : []), [suggestions])

  function initialState(row: RestockSuggestion): RowState {
    const key = row.variant_id
    return rowState[key] ?? { selected: true, qtyPurchase: row.suggested_qty_purchase }
  }

  function setRow(variantId: string, patch: Partial<RowState>) {
    setRowState((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] ?? { selected: true, qtyPurchase: '0' }),
        ...patch,
      },
    }))
  }

  async function createPoFromGroup(supplierId: string, rows: RestockSuggestion[]) {
    const activeRows = rows
      .map((r) => ({ row: r, state: initialState(r) }))
      .filter(({ state }) => state.selected && Number(state.qtyPurchase) > 0)

    if (activeRows.length === 0) {
      toast({ variant: 'destructive', title: 'Select at least one item' })
      return
    }

    setCreatingSupplierId(supplierId)
    try {
      const poId = crypto.randomUUID()
      const created = await createPo.mutateAsync({
        poId,
        supplierId,
        status: 'draft',
        note: null,
        items: activeRows.map(({ row, state }) => ({
          variant_id: row.variant_id,
          qty_ordered_purchase: state.qtyPurchase,
          expected_unit_cost: row.last_purchase_cost ?? '0',
        })),
      })
      toast({ title: 'Draft PO created', description: `PO #${created.po_number}` })
      navigate(`/purchase-orders/${created.id}`)
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't create PO", description: toReadableError(error) })
    } finally {
      setCreatingSupplierId(null)
    }
  }

  if (!canCreate) return <PermissionDeniedState requiredRole="manager" />

  return (
    <div>
      <PageHeader
        title="Restock"
        description="Products running low, grouped by their preferred supplier. Every quantity is editable."
      />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}

      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState
          icon={TrendingDown}
          title="All stock levels are healthy"
          description="Nothing is low, out, or negative. Restock suggestions will appear when products need reordering."
        />
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.supplierId ?? 'unlinked'}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {group.supplierName ? (
                      <>
                        {group.supplierName}
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-muted">
                          {group.rows.length} item{group.rows.length === 1 ? '' : 's'}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-4 text-warning" />
                        No preferred supplier
                      </>
                    )}
                  </CardTitle>
                  {!group.supplierName && (
                    <p className="mt-1 text-xs text-text-muted">
                      Link a preferred supplier on each product to enable one-click PO creation.
                    </p>
                  )}
                </div>
                {group.supplierId && (
                  <Button
                    size="sm"
                    onClick={() => createPoFromGroup(group.supplierId!, group.rows)}
                    disabled={createPo.isPending && creatingSupplierId === group.supplierId}
                  >
                    {creatingSupplierId === group.supplierId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ShoppingCart className="size-4" />
                    )}
                    Create draft PO
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                        {group.supplierId && <th className="w-8 py-2 pr-2 font-medium"></th>}
                        <th className="py-2 pr-3 font-medium">Product</th>
                        <th className="py-2 pr-3 font-medium">On hand</th>
                        <th className="py-2 pr-3 font-medium">Suggested (base)</th>
                        <th className="py-2 pr-3 font-medium">Order qty</th>
                        <th className="py-2 pr-3 font-medium">Last cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => {
                        const state = initialState(row)
                        const suggested = new Decimal(row.suggested_qty_base)
                        const orderBase = new Decimal(state.qtyPurchase || '0').times(row.conversion_to_base)
                        const overrideBadge = !new Decimal(state.qtyPurchase || '0').eq(row.suggested_qty_purchase)
                        return (
                          <tr
                            key={row.variant_id}
                            className={cn(
                              'border-b border-border-subtle last:border-b-0',
                              !state.selected && 'opacity-50',
                            )}
                          >
                            {group.supplierId && (
                              <td className="py-2.5 pr-2">
                                <input
                                  type="checkbox"
                                  checked={state.selected}
                                  onChange={(e) => setRow(row.variant_id, { selected: e.target.checked })}
                                  className="size-4 rounded border-border"
                                  aria-label={`Include ${row.product_name}`}
                                />
                              </td>
                            )}
                            <td className="py-2.5 pr-3">
                              <p className="font-medium text-text-primary">{row.product_name}</p>
                              {row.variant_name && (
                                <p className="text-xs text-text-muted">{row.variant_name}</p>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-text-secondary">
                              <p>
                                <Quantity value={row.qty_on_hand} />
                              </p>
                              <p className="text-xs text-text-muted">
                                threshold <Quantity value={row.low_stock_threshold} />
                              </p>
                            </td>
                            <td className="py-2.5 pr-3">
                              <p>
                                <Quantity value={suggested.toString()} />
                              </p>
                              <p className="text-xs text-text-muted">
                                <Info className="mr-0.5 inline size-3" />
                                default target = threshold × 2
                              </p>
                            </td>
                            <td className="py-2.5 pr-3">
                              {group.supplierId ? (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={state.qtyPurchase}
                                    onChange={(e) =>
                                      setRow(row.variant_id, { qtyPurchase: e.target.value })
                                    }
                                    inputMode="decimal"
                                    className="h-8 w-20"
                                  />
                                  <span className="text-xs text-text-muted">{row.purchase_unit}</span>
                                  {overrideBadge && (
                                    <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">
                                      overridden
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-text-muted">—</span>
                              )}
                              {group.supplierId && orderBase.gt(0) && (
                                <p className="mt-1 text-xs text-text-muted">
                                  = <Quantity value={orderBase.toString()} /> base
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-text-secondary">
                              {row.last_purchase_cost ? <Money value={row.last_purchase_cost} /> : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

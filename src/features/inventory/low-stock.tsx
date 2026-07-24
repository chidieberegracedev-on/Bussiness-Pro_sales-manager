import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Package, PackagePlus } from 'lucide-react'
import { useLowStock } from '@/features/inventory/use-low-stock'
import { useStockDialogStore } from '@/features/inventory/stock-dialog-store'
import { variantLabel } from '@/features/products/types'
import { useActiveBusiness } from '@/features/business/hooks'
import { PageHeader } from '@/components/layout/page-header'
import { TableSkeleton } from '@/components/data/loading-state'
import { ErrorState } from '@/components/data/error-state'
import { StockStatusBadge } from '@/components/data/stock-status-badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Quantity } from '@/components/quantity/quantity'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import type { StockStatus } from '@/types/database'
import type { VariantStockRow } from '@/features/products/types'

const SECTION_LABELS: Record<Exclude<StockStatus, 'ok'>, string> = {
  negative: 'Negative stock',
  out_of_stock: 'Out of stock',
  low: 'Low stock',
}

export function LowStockPage() {
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const { data: rows, isLoading, isError, refetch } = useLowStock()
  const openAddStock = useStockDialogStore((s) => s.openAddStock)
  const canManage = role === 'owner' || role === 'manager'
  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    rows?.map((r) => r.image_path) ?? [],
  )

  const sections = useMemo(() => {
    const grouped: Record<string, VariantStockRow[]> = { negative: [], out_of_stock: [], low: [] }
    for (const row of rows ?? []) {
      if (row.stock_status in grouped) grouped[row.stock_status].push(row)
    }
    return grouped
  }, [rows])

  function handleAddStock(row: VariantStockRow) {
    openAddStock({
      productId: row.product_id,
      productName: row.product_name,
      locationId: row.location_id ?? '',
      baseUnit: row.base_unit,
      variants: [{ variantId: row.variant_id, label: variantLabel(row), qtyOnHand: row.qty_on_hand, avgCost: row.avg_cost }],
      preselectVariantId: row.variant_id,
    })
  }

  return (
    <div>
      <PageHeader title="Low stock" description="Items that need attention, ordered by severity." />

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && rows && rows.length === 0 && (
        <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <h3 className="text-base font-semibold text-text-primary">Everything's well stocked</h3>
          <p className="max-w-sm text-sm text-text-secondary">No items are negative, out of stock, or below their threshold right now.</p>
        </Card>
      )}

      {!isLoading && !isError && rows && rows.length > 0 && (
        <div className="space-y-8">
          {(Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>).map((status) =>
            sections[status].length > 0 ? (
              <div key={status}>
                <h2 className="mb-2 text-sm font-semibold text-text-secondary">{SECTION_LABELS[status]} ({sections[status].length})</h2>
                <div className="divide-y divide-border rounded-md border border-border">
                  {sections[status].map((row) => {
                    const imageUrl = row.image_path ? imageUrls?.get(row.image_path) : undefined
                    return (
                      <div
                        key={row.variant_id}
                        className="flex cursor-pointer items-center gap-3 p-3 hover:bg-surface-muted/50"
                        onClick={() => navigate(`/products/${row.product_id}`)}
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
                          {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-4 text-text-muted" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-text-primary">
                            {row.product_name}
                            {row.has_variants && <span className="ml-1 text-text-muted">— {variantLabel(row)}</span>}
                          </p>
                          <p className="text-sm text-text-secondary">
                            <Quantity value={row.qty_on_hand} unit={row.base_unit} />
                            {row.low_stock_threshold !== '0' && <> · threshold <Quantity value={row.low_stock_threshold} unit={row.base_unit} /></>}
                          </p>
                        </div>
                        <StockStatusBadge status={row.stock_status} />
                        {canManage && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddStock(row)
                            }}
                          >
                            <PackagePlus className="size-4" /> Add stock
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}

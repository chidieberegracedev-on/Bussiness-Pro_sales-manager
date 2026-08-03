import { useParams, useNavigate, Link } from 'react-router-dom'
import { Package, Pencil, PackagePlus, PackageMinus, History } from 'lucide-react'
import { useProductDetail, useToggleProductActive } from '@/features/products/use-product-detail'
import { useRecentMovements } from '@/features/inventory/use-movements'
import { useStockDialogStore } from '@/features/inventory/stock-dialog-store'
import { variantLabel } from '@/features/products/types'
import { BarcodeManager } from '@/features/scan/barcode-manager'
import { CanonicalLink } from '@/features/network/canonical-link'
import { useActiveBusiness } from '@/features/business/hooks'
import { useCategories } from '@/features/products/categories-hooks'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useSignedImageUrl } from '@/hooks/use-signed-image-url'
import { toReadableError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { StockStatusBadge } from '@/components/data/stock-status-badge'
import { DetailSkeleton } from '@/components/data/loading-state'
import { ErrorState } from '@/components/data/error-state'
import { EmptyState } from '@/components/data/empty-state'
import { MovementsTable } from '@/features/inventory/movements-table'
import { Term } from '@/features/help/term'
import { toast } from '@/hooks/use-toast'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const { data: categories } = useCategories()
  const { product, variants, isLoading, isError, refetch } = useProductDetail(id)
  const toggleActive = useToggleProductActive()
  const openAddStock = useStockDialogStore((s) => s.openAddStock)
  const openAdjustStock = useStockDialogStore((s) => s.openAdjustStock)

  const variantIds = variants?.map((v) => v.variant_id)
  const { data: recentMovements } = useRecentMovements(variantIds)
  const { data: imageUrl } = useSignedImageUrl(PRODUCT_IMAGE_BUCKET, product?.image_path)

  const canManage = role === 'owner' || role === 'manager'

  if (isLoading) return <DetailSkeleton />
  if (isError || !product) return <ErrorState error={new Error('load')} onRetry={() => refetch()} />

  const categoryName = categories?.find((c) => c.id === product.category_id)?.name
  const isSimple = !product.has_variants

  function openStockDialog(kind: 'add' | 'adjust') {
    if (!variants || variants.length === 0) return
    const context = {
      productId: product!.id,
      productName: product!.name,
      locationId: variants[0].location_id ?? '',
      baseUnit: product!.base_unit,
      purchaseUnit: product!.purchase_unit,
      purchaseConversionQty: product!.purchase_conversion_qty,
      variants: variants.map((v) => ({ variantId: v.variant_id, label: variantLabel(v), qtyOnHand: v.qty_on_hand, avgCost: v.avg_cost })),
    }
    if (kind === 'add') openAddStock(context)
    else openAdjustStock(context)
  }

  async function handleToggleActive(checked: boolean) {
    try {
      await toggleActive.mutateAsync({ id: product!.id, isActive: checked })
      toast({ title: checked ? 'Product activated' : 'Product deactivated' })
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't update product", description: toReadableError(error) })
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
            {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-6 text-text-muted" />}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{product.name}</h1>
            <p className="text-sm text-text-secondary">{categoryName ?? 'Uncategorized'}</p>
            {!product.is_active && <p className="mt-1 text-sm font-medium text-text-muted">Inactive</p>}
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={product.is_active} onCheckedChange={handleToggleActive} aria-label="Product active" />
              <span className="text-sm text-text-secondary">Active</span>
            </div>
            <Button variant="outline" onClick={() => navigate(`/products/${product.id}/edit`)}>
              <Pencil className="size-4" /> Edit
            </Button>
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openStockDialog('add')}>
            <PackagePlus className="size-4" /> Add stock
          </Button>
          <Button variant="outline" onClick={() => openStockDialog('adjust')}>
            <PackageMinus className="size-4" /> Adjust stock
          </Button>
        </div>
      )}

      {isSimple && variants && variants.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Stock</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase text-text-muted">On hand</p>
              <p className="mt-1 text-lg font-semibold"><Quantity value={variants[0].qty_on_hand} unit={product.base_unit} /></p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-text-muted">Status</p>
              <div className="mt-1"><StockStatusBadge status={variants[0].stock_status} /></div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-text-muted">
                <Term slug="average-cost">Average cost</Term>
              </p>
              <p className="mt-1 text-lg font-semibold"><Money value={variants[0].avg_cost} /></p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-text-muted">
                <Term slug="stock-value">Stock value</Term>
              </p>
              <p className="mt-1 text-lg font-semibold"><Money value={variants[0].stock_value} /></p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Barcodes are per-variant, so a simple product gets the manager inline
          and a variant product manages codes from each variant row. */}
      {isSimple && variants && variants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Barcodes</CardTitle>
          </CardHeader>
          <CardContent>
            <BarcodeManager
              variantId={variants[0].variant_id}
              baseUnit={product.base_unit}
              primaryBarcode={variants[0].barcode}
            />
          </CardContent>
        </Card>
      )}

      {isSimple && variants && variants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Shared catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <CanonicalLink
              variantId={variants[0].variant_id}
              variantName={product.name}
              barcode={variants[0].barcode}
              baseUnit={product.base_unit}
            />
          </CardContent>
        </Card>
      )}

      {!isSimple && variants && (
        <Card>
          <CardHeader><CardTitle>Variants</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Options</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Avg. cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.variant_id}>
                    <TableCell className="font-medium text-text-primary">{variantLabel(v)}</TableCell>
                    <TableCell className="text-text-secondary">{v.sku ?? '—'}</TableCell>
                    <TableCell className="text-text-secondary">{v.barcode ?? '—'}</TableCell>
                    <TableCell><Money value={v.selling_price} /></TableCell>
                    <TableCell><Quantity value={v.qty_on_hand} unit={product.base_unit} /></TableCell>
                    <TableCell><Money value={v.avg_cost} /></TableCell>
                    <TableCell><StockStatusBadge status={v.stock_status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent stock movements</CardTitle>
          {canManage && (
            <Link to={`/inventory/movements?product=${product.id}`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <History className="size-4" /> View full history
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {recentMovements && recentMovements.length > 0 ? (
            <MovementsTable rows={recentMovements} showProduct={product.has_variants} />
          ) : (
            <EmptyState title="No stock movements yet" description="Movements appear here once stock is added or adjusted." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

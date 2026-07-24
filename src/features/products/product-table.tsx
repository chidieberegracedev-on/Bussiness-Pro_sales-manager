import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Package } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { StockStatusBadge } from '@/components/data/stock-status-badge'
import { ProductActionsMenu } from '@/features/products/product-actions-menu'
import { variantLabel, type GroupedProduct } from '@/features/products/types'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { cn } from '@/lib/utils'

function ProductThumb({ url }: { url: string | undefined }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Package className="size-4 text-text-muted" />}
    </div>
  )
}

function PriceRange({ min, max }: { min: string; max: string }) {
  if (min === max) return <Money value={min} />
  return (
    <span className="whitespace-nowrap">
      <Money value={min} /> – <Money value={max} />
    </span>
  )
}

export function ProductTable({ products }: { products: GroupedProduct[] }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    products.map((p) => p.imagePath),
  )

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Stock</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const isExpanded = expanded.has(product.productId)
          return (
            <Fragment key={product.productId}>
              <TableRow
                className={cn('cursor-pointer', !product.isActive && 'opacity-60')}
                onClick={() => navigate(`/products/${product.productId}`)}
              >
                <TableCell>
                  {product.hasVariants && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(product.productId)
                      }}
                      aria-label={isExpanded ? 'Collapse variants' : 'Expand variants'}
                      aria-expanded={isExpanded}
                      className="flex size-6 items-center justify-center rounded hover:bg-surface-muted"
                    >
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <ProductThumb url={product.imagePath ? imageUrls?.get(product.imagePath) : undefined} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{product.productName}</p>
                      {product.hasVariants && (
                        <p className="text-xs text-text-muted">{product.variants.length} variants</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-text-secondary">{product.categoryName ?? '—'}</TableCell>
                <TableCell className="text-text-secondary">{product.baseUnit}</TableCell>
                <TableCell><PriceRange min={product.priceMin} max={product.priceMax} /></TableCell>
                <TableCell><Quantity value={product.totalQty} unit={product.baseUnit} /></TableCell>
                <TableCell><StockStatusBadge status={product.worstStatus} /></TableCell>
                <TableCell>
                  <ProductActionsMenu product={product} />
                </TableCell>
              </TableRow>
              {isExpanded &&
                product.variants.map((variant) => (
                  <TableRow
                    key={variant.variant_id}
                    className="cursor-pointer bg-surface-muted/40"
                    onClick={() => navigate(`/products/${product.productId}`)}
                  >
                    <TableCell />
                    <TableCell colSpan={2} className="pl-12 text-sm text-text-secondary">
                      {variantLabel(variant)}
                      {variant.sku && <span className="ml-2 text-xs text-text-muted">SKU {variant.sku}</span>}
                    </TableCell>
                    <TableCell className="text-text-secondary">{product.baseUnit}</TableCell>
                    <TableCell><Money value={variant.selling_price} /></TableCell>
                    <TableCell><Quantity value={variant.qty_on_hand} unit={product.baseUnit} /></TableCell>
                    <TableCell><StockStatusBadge status={variant.stock_status} /></TableCell>
                    <TableCell />
                  </TableRow>
                ))}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

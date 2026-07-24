import { useNavigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { StockStatusBadge } from '@/components/data/stock-status-badge'
import { ProductActionsMenu } from '@/features/products/product-actions-menu'
import type { GroupedProduct } from '@/features/products/types'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { cn } from '@/lib/utils'

export function ProductCardGrid({ products }: { products: GroupedProduct[] }) {
  const navigate = useNavigate()
  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    products.map((p) => p.imagePath),
  )

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => {
        const url = product.imagePath ? imageUrls?.get(product.imagePath) : undefined
        return (
          <Card
            key={product.productId}
            className={cn('cursor-pointer overflow-hidden transition-shadow hover:shadow-md', !product.isActive && 'opacity-60')}
            onClick={() => navigate(`/products/${product.productId}`)}
          >
            <div className="flex aspect-square items-center justify-center bg-surface-muted">
              {url ? <img src={url} alt="" className="size-full object-cover" /> : <Package className="size-8 text-text-muted" />}
            </div>
            <div className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-1">
                <p className="line-clamp-2 text-sm font-medium text-text-primary">{product.productName}</p>
                <ProductActionsMenu product={product} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">
                  <Money value={product.priceMin} />
                  {product.priceMin !== product.priceMax && '+'}
                </span>
                <Quantity value={product.totalQty} unit={product.baseUnit} className="text-text-muted" />
              </div>
              <StockStatusBadge status={product.worstStatus} />
            </div>
          </Card>
        )
      })}
    </div>
  )
}

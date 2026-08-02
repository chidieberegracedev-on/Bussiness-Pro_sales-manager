import { useEffect, useRef, useState } from 'react'
import { Search, Package } from 'lucide-react'
import { useProductList } from '@/features/products/use-product-list'
import { useCategories } from '@/features/products/categories-hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCartStore } from '@/features/pos/cart-store'
import { variantLabel, type GroupedProduct } from '@/features/products/types'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { StockStatusBadge } from '@/components/data/stock-status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { CardGridSkeleton } from '@/components/data/loading-state'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import Decimal from 'decimal.js'

function VariantSelector({ product }: { product: GroupedProduct }) {
  const addLine = useCartStore((s) => s.addLine)

  return (
    <div className="space-y-1">
      {product.variants.map((v) => (
        <button
          key={v.variant_id}
          type="button"
          onClick={() =>
            addLine({
              variantId: v.variant_id,
              productName: product.productName,
              variantName: variantLabel(v),
              baseUnit: product.baseUnit,
              unitPrice: new Decimal(v.selling_price),
            })
          }
          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-muted"
        >
          <span className="min-w-0 flex-1 truncate">{variantLabel(v)}</span>
          <Money value={v.selling_price} className="shrink-0 font-medium" />
          <StockStatusBadge status={v.stock_status} />
        </button>
      ))}
    </div>
  )
}

function ProductTile({ product, imageUrl }: { product: GroupedProduct; imageUrl: string | undefined }) {
  const addLine = useCartStore((s) => s.addLine)

  function handleSimpleAdd() {
    const only = product.variants[0]
    addLine({
      variantId: only.variant_id,
      productName: product.productName,
      variantName: null,
      baseUnit: product.baseUnit,
      unitPrice: new Decimal(only.selling_price),
    })
  }

  const tileContent = (
    <div
      className={cn(
        // No padding around the image: it runs to the card edge, and only the
        // text below is inset. That single change is most of what separates a
        // designed tile from a boxed one.
        'flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-border-strong',
        !product.isActive && 'opacity-60',
      )}
    >
      <div className="flex aspect-square items-center justify-center bg-surface-muted">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Package className="size-8 text-text-muted" />
        )}
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
          {product.productName}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-accent-primary">
            <Money value={product.priceMin} />
            {product.priceMin !== product.priceMax && '+'}
          </span>
          <StockStatusBadge status={product.worstStatus} />
        </div>
      </div>
    </div>
  )

  if (product.hasVariants) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="w-full">
            {tileContent}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <p className="mb-2 text-xs font-semibold uppercase text-text-muted">Choose an option</p>
          <VariantSelector product={product} />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <button type="button" className="w-full" onClick={handleSimpleAdd}>
      {tileContent}
    </button>
  )
}

export function ProductPicker() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | 'all'>('all')
  const debouncedSearch = useDebouncedValue(search, 300)
  const { data: categories } = useCategories()
  const { data: products, isLoading, isError, refetch } = useProductList({
    search: debouncedSearch,
    categoryId,
    status: 'all',
    active: 'active',
  })
  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    (products ?? []).map((p) => p.imagePath),
  )

  const searchRef = useRef<HTMLInputElement>(null)
  const addedCount = useCartStore((s) => s.addedCount)
  const isFirstRender = useRef(true)

  // Refocuses the search bar after every add, so a cashier can work entirely
  // from the keyboard (WEB_IMPLEMENTATION.md §2).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    searchRef.current?.focus()
  }, [addedCount])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          ref={searchRef}
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, SKU, or barcode"
          className="pl-9"
          aria-label="Search products"
        />
      </div>

      {/* Chips are navigation, not the point of the screen. They select with a
          neutral fill so the accent stays reserved for Take payment — one
          accent per screen is what makes that button read as the next step. */}
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip active={categoryId === 'all'} onClick={() => setCategoryId('all')}>
          All
        </CategoryChip>
        {categories?.map((c) => (
          <CategoryChip
            key={c.id}
            active={categoryId === c.id}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </CategoryChip>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <CardGridSkeleton />}
        {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}
        {!isLoading && !isError && products && products.length === 0 && (
          <EmptyState
            icon={Package}
            title="No products found"
            description={search || categoryId !== 'all' ? 'Try a different search or category.' : 'Add products before selling.'}
          />
        )}
        {!isLoading && !isError && products && products.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductTile
                key={product.productId}
                product={product}
                imageUrl={product.imagePath ? imageUrls?.get(product.imagePath) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A filter chip. Deliberately not a Button: `variant="default"` would give it
 * the same accent and weight as Take payment, and when everything on screen
 * carries the accent, nothing does. Selection reads through a neutral fill.
 */
function CategoryChip({
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
        'min-h-11 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-transparent bg-text-primary font-semibold text-background'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

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
              imagePath: product.imagePath,
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
      imagePath: product.imagePath,
    })
  }

  const tileContent = (
    <div
      className={cn(
        // A card is a fixed box. Everything inside reflows within it — the card
        // width drives the content, never the other way round, which is what
        // stops a long price or a badge escaping when the cart panel expands.
        'flex h-full w-full min-w-0 flex-col rounded-2xl bg-card p-2 text-left',
        // Level 3: a product card lifts off the page. Shadow, not border —
        // carrying both is what flattened every surface into one plane.
        'shadow-e2 transition-shadow duration-150 hover:shadow-e3',
        !product.isActive && 'opacity-60',
      )}
    >
      {/* The focal shape. Inset by the card's own padding and rounded harder
          than the card, so the image reads as the subject rather than as a
          bordered box inside a box. */}
      <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/60">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Package className="size-8 text-tint-accent-foreground/50" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1 pb-0.5 pt-2.5">
        {/* One line, always. A two-line name on one card and one on the next is
            what made the rows sit at different heights. */}
        <p className="truncate text-sm font-semibold leading-snug text-text-primary">
          {product.productName}
        </p>
        <p className="truncate text-xs text-text-muted">
          {product.hasVariants
            ? `${product.variants.length} options`
            : (product.variants[0]?.sku ?? product.baseUnit)}
        </p>

        {/* min-w-0 on both children is the fix for the pop-out: without it a
            flex child refuses to shrink below its content and overflows. */}
        <div className="mt-auto flex min-w-0 items-center justify-between gap-1.5 pt-2">
          {/* The price is the data anchor — heavier and in accent, so the eye
              lands on it before the meta line. */}
          <span className="min-w-0 truncate text-[clamp(0.8125rem,1.1vw,0.9375rem)] font-bold text-accent-primary">
            <Money value={product.priceMin} />
            {product.priceMin !== product.priceMax && '+'}
          </span>
          <span className="shrink-0">
            <StockStatusBadge status={product.worstStatus} />
          </span>
        </div>
      </div>
    </div>
  )

  if (product.hasVariants) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="h-full w-full">
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
    <button type="button" className="h-full w-full" onClick={handleSimpleAdd}>
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

      {/* Chips are navigation, not the point of the screen. The selected one
          takes a soft accent TINT — ambient colour, not a solid accent fill,
          so Take payment is still the only saturated thing on screen. */}
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
          <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
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
 * carries the accent, nothing does. Selection reads through an accent tint —
 * full pill radius, so it can never be mistaken for a card or a control.
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
          ? 'border-transparent bg-tint-accent font-semibold text-tint-accent-foreground'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

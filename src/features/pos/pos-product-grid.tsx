import { useEffect, useMemo, useRef, useState } from 'react'
import Decimal from 'decimal.js'
import { Minus, Package, Plus, Search } from 'lucide-react'
import { useProductList } from '@/features/products/use-product-list'
import { useCategories } from '@/features/products/categories-hooks'
import { CategoryIconGlyph } from '@/features/products/category-icon-picker'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCartStore } from '@/features/pos/cart-store'
import { useProductSink } from '@/features/pos/product-sink'
import { variantLabel, type GroupedProduct } from '@/features/products/types'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VariantPicker } from '@/features/pos/variant-picker'
import { cn } from '@/lib/utils'
import type { StockStatus } from '@/types/database'

/**
 * The selling surface.
 *
 * Image-forward tiles, a stock pill on the image, and the add control living
 * INSIDE the tile — a tap adds, and once a product is in the basket the same
 * control becomes its stepper, so a cashier adjusting quantity never has to
 * cross the screen to the cart. That round trip is the single biggest source
 * of friction on a busy till.
 */
export function PosProductGrid({
  showImages = true,
  view = 'grid',
  categoryFirst = false,
  barcodeFirst = true,
  variantsEnabled = false,
}: {
  showImages?: boolean
  /** 'list' packs more lines in; 'grid' is image-forward. */
  view?: string
  /** Make the operator choose a category before any products are listed. */
  categoryFirst?: boolean
  /** Lead the search field with the scanner rather than the keyboard. */
  barcodeFirst?: boolean
  /** Boutique: open a size/colour picker instead of a flat variant list. */
  variantsEnabled?: boolean
}) {
  const [search, setSearch] = useState('')
  /**
   * `null` means the operator has not chosen yet — distinct from 'all'.
   *
   * It cannot be seeded from `categoryFirst`: that prop comes from
   * business_pos_config, which loads asynchronously, so on the first render it
   * is always false and a `useState(categoryFirst ? … : …)` initialiser would
   * lock in the wrong value forever. The flag is applied at read time instead.
   */
  const [categoryId, setCategoryId] = useState<string | 'all' | null>(null)
  const debouncedSearch = useDebouncedValue(search, 250)
  const isList = view === 'list'
  // Category-first means exactly that: nothing is listed until a category is
  // picked or something is typed. On a catalog of thousands, a wall of every
  // product is not a starting point.
  const awaitingCategory = categoryFirst && categoryId === null && !debouncedSearch.trim()

  const { data: categories } = useCategories()
  const { data: products, isLoading, isError, refetch } = useProductList({
    search: debouncedSearch,
    // The list hook only understands 'all' or a real id; "not chosen" reads
    // as everything, and category-first hides the result instead.
    categoryId: categoryId ?? 'all',
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

  // Refocus the search bar after every add, so the next lookup is just typing.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    searchRef.current?.focus()
  }, [addedCount])

  // F1 puts the cursor in search from anywhere on the till.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'F1') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 shadow-e1">
          <Search className="size-[1.15rem] shrink-0 text-icon" aria-hidden="true" />
          <Input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              barcodeFirst
                ? 'Scan a barcode, or search by name or SKU'
                : 'Search by name, SKU or barcode'
            }
            aria-label="Search products"
            className="h-14 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
          <kbd className="hidden shrink-0 rounded-md bg-background px-2 py-1 font-mono text-[0.6875rem] font-semibold text-text-muted sm:block">
            F1
          </kbd>
        </div>

        {!awaitingCategory && (
          <div className="scrollbar-none -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            <CategoryChip
              active={categoryId === 'all' || categoryId === null}
              onClick={() => setCategoryId(categoryFirst ? null : 'all')}
            >
              {categoryFirst ? '← Categories' : 'All'}
            </CategoryChip>
            {categories?.map((c) => (
              <CategoryChip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                <CategoryIconGlyph icon={c.icon} className="mr-1.5" />
                {c.name}
              </CategoryChip>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
        {/* Category-first landing. Big targets, because on a boutique or
            restaurant floor this is the first thing a finger lands on. */}
        {awaitingCategory && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className="flex min-h-24 items-center justify-center rounded-2xl bg-accent-primary px-4 text-base font-bold text-primary-foreground shadow-e1"
            >
              Everything
            </button>
            {categories?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface px-4 text-center text-base font-semibold text-text-primary shadow-e1 transition-shadow hover:shadow-e2"
              >
                <CategoryIconGlyph icon={c.icon} className="text-2xl" />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {!awaitingCategory && isLoading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl" />
            ))}
          </div>
        )}

        {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

        {!awaitingCategory && !isLoading && !isError && products && products.length === 0 && (
          <EmptyState
            icon={Package}
            title="Nothing here"
            description={
              search || (categoryId !== 'all' && categoryId !== null)
                ? 'Try a different search or category.'
                : 'Add products before selling.'
            }
          />
        )}

        {!awaitingCategory && !isLoading && !isError && products && products.length > 0 && (
          <div
            className={
              isList
                ? 'space-y-2'
                : 'grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4'
            }
          >
            {products.map((product) =>
              isList ? (
                <ProductRow
                  key={product.productId}
                  product={product}
                  showImage={showImages}
                  variantsEnabled={variantsEnabled}
                  imageUrl={product.imagePath ? imageUrls?.get(product.imagePath) : undefined}
                />
              ) : (
                <ProductTile
                  key={product.productId}
                  product={product}
                  showImage={showImages}
                  variantsEnabled={variantsEnabled}
                  imageUrl={product.imagePath ? imageUrls?.get(product.imagePath) : undefined}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const STOCK_PILL: Record<StockStatus, { label: string; className: string }> = {
  ok: { label: 'In stock', className: 'bg-surface/90 text-text-secondary' },
  low: { label: 'Low', className: 'bg-tint-warning text-tint-warning-foreground' },
  out_of_stock: { label: 'Out', className: 'bg-tint-danger text-tint-danger-foreground' },
  negative: { label: 'Negative', className: 'bg-tint-danger text-tint-danger-foreground' },
}

/**
 * The list row — the grocery personality's product line.
 *
 * Same data, a quarter of the vertical space. A grocery catalog is mostly
 * scanned rather than browsed, so when someone does search, they want as many
 * candidate lines on screen as possible, not four big pictures.
 */
function ProductRow({
  product,
  imageUrl,
  showImage,
  variantsEnabled,
}: {
  product: GroupedProduct
  imageUrl: string | undefined
  showImage: boolean
  variantsEnabled: boolean
}) {
  const sink = useProductSink()

  const only = product.variants[0]
  const rowQty = only && !product.hasVariants ? sink.quantityOf(only.variant_id) : new Decimal(0)
  const inSink = rowQty.gt(0)

  const pill = STOCK_PILL[product.worstStatus]

  function addSimple() {
    if (!only) return
    sink.add({
      variantId: only.variant_id,
      productName: product.productName,
      variantName: null,
      baseUnit: product.baseUnit,
      unitPrice: new Decimal(only.selling_price),
      imagePath: product.imagePath,
    })
  }

  const body = (
    <>
      {showImage && (
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/50">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <Package className="size-4 text-tint-accent-foreground/40" aria-hidden="true" />
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold text-text-primary">
          {product.productName}
        </span>
        <span className="type-meta block truncate">
          {product.hasVariants
            ? `${product.variants.length} options`
            : (only?.sku ?? product.baseUnit)}
          {pill && product.worstStatus !== 'ok' && ` · ${pill.label}`}
        </span>
      </span>

      <span className="shrink-0 text-[0.9375rem] font-bold tabular-nums text-text-primary">
        <Money value={product.priceMin} />
        {product.priceMin !== product.priceMax && '+'}
      </span>
    </>
  )

  if (product.hasVariants) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-e1 transition-shadow hover:shadow-e2"
          >
            {body}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className={variantsEnabled ? 'w-80' : 'w-72'}>
          {variantsEnabled ? (
            <VariantPicker product={product} />
          ) : (
            <>
              <p className="type-eyebrow mb-2">Choose an option</p>
              <VariantList product={product} />
            </>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 shadow-e1">
      {body}
      {inSink && only ? (
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-accent-primary p-1 text-primary-foreground">
          <StepButton
            label={`Remove one ${product.productName}`}
            onClick={() => sink.setQuantity(only.variant_id, rowQty.minus(1))}
          >
            <Minus className="size-3.5" />
          </StepButton>
          <span className="min-w-6 text-center text-sm font-bold tabular-nums">
            {rowQty.toString()}
          </span>
          <StepButton label={`Add one ${product.productName}`} onClick={addSimple}>
            <Plus className="size-3.5" />
          </StepButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={addSimple}
          aria-label={`Add ${product.productName}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-text-primary transition-colors hover:bg-tint-accent"
        >
          <Plus className="size-4" />
        </button>
      )}
    </div>
  )
}

function ProductTile({
  product,
  imageUrl,
  showImage,
  variantsEnabled,
}: {
  product: GroupedProduct
  imageUrl: string | undefined
  showImage: boolean
  variantsEnabled: boolean
}) {
  const sink = useProductSink()

  // A product with one variant has one line; a variant product may have
  // several, so the tile shows the total across them.
  const inCart = useMemo(
    () =>
      product.variants.reduce(
        (sum, v) => sum.plus(sink.quantityOf(v.variant_id)),
        new Decimal(0),
      ),
    [product, sink],
  )

  const only = product.variants[0]
  const tileQty = only && !product.hasVariants ? sink.quantityOf(only.variant_id) : new Decimal(0)
  const stepping = tileQty.gt(0)

  const pill = STOCK_PILL[product.worstStatus] ?? {
    label: 'Unknown',
    className: 'bg-surface/90 text-text-muted',
  }

  function addSimple() {
    if (!only) return
    sink.add({
      variantId: only.variant_id,
      productName: product.productName,
      variantName: null,
      baseUnit: product.baseUnit,
      unitPrice: new Decimal(only.selling_price),
      imagePath: product.imagePath,
    })
  }

  const tile = (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-e1 transition-shadow',
        'hover:shadow-e2',
        inCart.gt(0) && 'ring-2 ring-accent-primary',
        !product.isActive && 'opacity-60',
      )}
    >
      {showImage && (
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-tint-accent/50">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Package className="size-8 text-tint-accent-foreground/40" aria-hidden="true" />
            </div>
          )}
          <span
            className={cn(
              'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold shadow-e1',
              pill.className,
            )}
          >
            {pill.label}
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col p-3">
        {/* Two lines, not one. A till tile is narrow, and "Long grain rice …"
            is not a product a cashier can pick from confidently. The fixed
            min-height keeps every tile in a row the same height whether the
            name wraps or not. */}
        <p className="line-clamp-2 min-h-[2.6rem] text-[0.9375rem] font-semibold leading-snug text-text-primary">
          {product.productName}
        </p>
        <p className="type-meta truncate">
          {product.hasVariants
            ? `${product.variants.length} options`
            : (only?.sku ?? product.baseUnit)}
        </p>

        <p className="mt-2 text-[1.0625rem] font-bold tabular-nums text-text-primary">
          <Money value={product.priceMin} />
          {product.priceMin !== product.priceMax && (
            <span className="text-sm font-semibold text-text-muted">+</span>
          )}
        </p>

        {/* The add control lives in the tile and becomes the stepper. */}
        <div className="mt-3">
          {product.hasVariants ? (
            <span className="flex h-10 w-full items-center justify-center rounded-xl bg-background text-sm font-semibold text-text-primary">
              Choose option
            </span>
          ) : stepping && only ? (
            <div className="flex h-10 items-center justify-between rounded-xl bg-accent-primary px-1.5 text-primary-foreground">
              <StepButton
                label={`Remove one ${product.productName}`}
                onClick={(e) => {
                  e.stopPropagation()
                  sink.setQuantity(only.variant_id, tileQty.minus(1))
                }}
              >
                <Minus className="size-4" />
              </StepButton>
              <span className="text-sm font-bold tabular-nums">{tileQty.toString()}</span>
              <StepButton
                label={`Add one ${product.productName}`}
                onClick={(e) => {
                  e.stopPropagation()
                  addSimple()
                }}
              >
                <Plus className="size-4" />
              </StepButton>
            </div>
          ) : (
            <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-background text-sm font-semibold text-text-primary transition-colors group-hover:bg-tint-accent">
              <Plus className="size-4" /> Add
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (product.hasVariants) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="group h-full w-full text-left">
            {tile}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className={variantsEnabled ? 'w-80' : 'w-72'}>
          {/* Boutique gets axis pickers; everything else gets the flat list,
              which is faster when a product has three variants rather than
              a size/colour matrix. */}
          {variantsEnabled ? (
            <VariantPicker product={product} />
          ) : (
            <>
              <p className="type-eyebrow mb-2">Choose an option</p>
              <VariantList product={product} />
            </>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  // Already stepping — the whole tile must not also add, or a tap on the minus
  // would decrement and then the bubble would re-add.
  if (stepping) return <div className="group h-full w-full">{tile}</div>

  return (
    <button type="button" onClick={addSimple} className="group h-full w-full text-left">
      {tile}
    </button>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: (event: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface/25"
    >
      {children}
    </button>
  )
}

function VariantList({ product }: { product: GroupedProduct }) {
  const sink = useProductSink()

  return (
    <div className="space-y-1">
      {product.variants.map((v) => (
        <button
          key={v.variant_id}
          type="button"
          onClick={() =>
            sink.add({
              variantId: v.variant_id,
              productName: product.productName,
              variantName: variantLabel(v),
              baseUnit: product.baseUnit,
              unitPrice: new Decimal(v.selling_price),
              imagePath: product.imagePath,
            })
          }
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-background"
        >
          <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
            {variantLabel(v)}
          </span>
          <span className="shrink-0 font-bold tabular-nums text-text-primary">
            <Money value={v.selling_price} />
          </span>
        </button>
      ))}
    </div>
  )
}

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
        'min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-text-primary text-background'
          : 'bg-surface text-text-secondary shadow-e1 hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Globe, Search, SlidersHorizontal, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import {
  useMarketplace,
  useMarketplaceCategories,
  useListingTiersFor,
  useConnectionStatusMap,
  type MarketplaceProduct,
} from '@/features/network/use-network'
import { SupplierOfferRow } from '@/features/network/supplier-offer-row'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'

type SortKey = 'best' | 'price' | 'moq' | 'orders'

const SORT_LABELS: Record<SortKey, string> = {
  best: 'Best match',
  price: 'Lowest price',
  moq: 'Lowest minimum order',
  orders: 'Most orders completed',
}

/**
 * Product search — the buyer's working screen.
 *
 * Results are SUPPLIER OFFERS, not products, because the question being asked
 * is "who will sell me this and for how much". Products group those offers so
 * one product sold by four suppliers is one heading with four rows underneath,
 * not four unrelated cards to reconcile by hand.
 */
export function MarketplacePage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState<string | 'all'>(params.get('category') ?? 'all')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [connectedOnly, setConnectedOnly] = useState(false)
  const [maxMoq, setMaxMoq] = useState('')
  const [sort, setSort] = useState<SortKey>('best')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const debounced = useDebouncedValue(search, 300)
  const canonicalFilter = params.get('product') ?? undefined

  const { data: categories } = useMarketplaceCategories()
  const { products, isLoading, isError, refetch } = useMarketplace({
    search: debounced,
    category,
    canonicalProductId: canonicalFilter,
  })
  const connections = useConnectionStatusMap()

  // Filters the view can't express are applied here rather than by adding
  // columns to the query — they are all cheap predicates over rows already
  // fetched, and round-tripping for each checkbox would make the rail feel
  // broken on a slow connection.
  const filtered = useMemo(() => {
    const moqCeiling = maxMoq.trim() ? new Decimal(maxMoq) : null

    return products
      .map((product) => ({
        ...product,
        suppliers: product.suppliers.filter((s) => {
          if (verifiedOnly && s.verification !== 'verified') return false
          if (inStockOnly && s.availability !== 'active') return false
          if (connectedOnly && connections.get(s.supplier_profile_id)?.status !== 'accepted') {
            return false
          }
          if (moqCeiling && new Decimal(s.min_order_qty).gt(moqCeiling)) return false
          return true
        }),
      }))
      // A product whose every offer was filtered out is not a result.
      .filter((product) => product.suppliers.length > 0)
      .map((product) => ({ ...product, supplierCount: product.suppliers.length }))
  }, [products, verifiedOnly, inStockOnly, connectedOnly, maxMoq, connections])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort === 'price') {
      list.sort((a, b) => {
        if (!a.fromPrice) return 1
        if (!b.fromPrice) return -1
        return a.fromPrice.comparedTo(b.fromPrice)
      })
    } else if (sort === 'moq') {
      const lowest = (p: MarketplaceProduct) =>
        Math.min(...p.suppliers.map((s) => Number(s.min_order_qty)))
      list.sort((a, b) => lowest(a) - lowest(b))
    } else if (sort === 'orders') {
      const best = (p: MarketplaceProduct) =>
        Math.max(...p.suppliers.map((s) => s.completed_orders ?? 0))
      list.sort((a, b) => best(b) - best(a))
    }
    return list
  }, [filtered, sort])

  const offerCount = sorted.reduce((sum, p) => sum + p.suppliers.length, 0)
  const activeFilterCount =
    (verifiedOnly ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (connectedOnly ? 1 : 0) +
    (maxMoq.trim() ? 1 : 0) +
    (category !== 'all' ? 1 : 0)

  function clearFilters() {
    setVerifiedOnly(false)
    setInStockOnly(false)
    setConnectedOnly(false)
    setMaxMoq('')
    setCategory('all')
  }

  return (
    <div>
      <PageHeader eyebrow="Supplier Network" title="Product search" />

      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-card p-2 pl-5 shadow-e2">
        <Search className="size-5 shrink-0 text-icon" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products, suppliers, categories, or SKUs"
          aria-label="Search the supplier network"
          className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 lg:hidden"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeFilterCount > 0 && <Badge variant="accent">{activeFilterCount}</Badge>}
        </Button>
      </div>

      {canonicalFilter && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-tint-accent px-4 py-2.5">
          <span className="text-sm font-medium text-tint-accent-foreground">
            Showing one product only
          </span>
          <Button
            variant="outline"
            size="sm"
            className="bg-surface"
            onClick={() => {
              params.delete('product')
              setParams(params)
            }}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Filter rail */}
        <aside
          className={cn(
            'w-full shrink-0 lg:block lg:w-60',
            filtersOpen ? 'block' : 'hidden',
          )}
          aria-label="Filters"
        >
          <div className="rounded-2xl bg-card p-4 shadow-e2">
            <div className="flex items-center justify-between">
              <h2 className="type-eyebrow">Product filters</h2>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[0.75rem] font-semibold text-accent-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <FilterGroup label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Category"
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary"
              >
                <option value="all">All categories</option>
                {(categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterGroup>

            <FilterGroup label="Maximum order minimum">
              <Input
                value={maxMoq}
                onChange={(e) => setMaxMoq(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="Any"
                aria-label="Maximum minimum-order quantity"
                className="h-9"
              />
              <p className="type-meta mt-1">
                Hide suppliers who won't sell you fewer than this.
              </p>
            </FilterGroup>

            <FilterGroup label="Availability">
              <CheckRow checked={inStockOnly} onChange={setInStockOnly} label="In stock only" />
            </FilterGroup>

            <div className="mt-5 border-t border-border pt-4">
              <h2 className="type-eyebrow">Supplier filters</h2>
              <div className="mt-2.5 space-y-2.5">
                <CheckRow
                  checked={verifiedOnly}
                  onChange={setVerifiedOnly}
                  label="Verified suppliers only"
                />
                <CheckRow
                  checked={connectedOnly}
                  onChange={setConnectedOnly}
                  label="Suppliers I'm connected to"
                />
              </div>
              {/* Named honestly rather than shown as dead controls: the data
                  behind distance and rating is not captured yet (brief §15 —
                  capture first, score later). */}
              <p className="type-meta mt-3">
                Distance, response time and buyer rating become filters once the
                network has enough completed orders behind them.
              </p>
            </div>
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="type-body">
              {isLoading ? (
                'Searching…'
              ) : (
                <>
                  <strong className="font-semibold text-text-primary">{offerCount}</strong> offer
                  {offerCount === 1 ? '' : 's'} from{' '}
                  <strong className="font-semibold text-text-primary">{sorted.length}</strong>{' '}
                  product{sorted.length === 1 ? '' : 's'}
                  {debounced.trim() && <> for “{debounced.trim()}”</>}
                </>
              )}
            </p>
            <label className="flex items-center gap-2 text-[0.8125rem] text-text-secondary">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm font-medium text-text-primary"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-2xl" />
              ))}
            </div>
          )}

          {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

          {!isLoading && !isError && sorted.length === 0 && (
            <EmptyState
              icon={Globe}
              title={activeFilterCount > 0 ? 'Nothing matches those filters' : 'Nothing found'}
              description={
                activeFilterCount > 0
                  ? 'Loosen a filter — the strictest ones are usually the minimum order and verified-only.'
                  : 'Suppliers appear here as soon as they publish a storefront. If you sell to other businesses, you can be listed today.'
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/network/my-profile">
                      <Store className="size-4" /> Sell on the network
                    </Link>
                  </Button>
                )
              }
            />
          )}

          {!isLoading && !isError && sorted.length > 0 && (
            <div className="space-y-8">
              {sorted.map((product) => (
                <ProductGroup key={product.canonicalProductId} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductGroup({ product }: { product: MarketplaceProduct }) {
  const listingIds = useMemo(() => product.suppliers.map((s) => s.listing_id), [product])
  const { data: tiersByListing } = useListingTiersFor(listingIds)

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Link
            to={`/network/products/${product.canonicalProductId}`}
            className="type-title hover:underline"
          >
            {product.productName}
          </Link>
          <p className="type-meta mt-0.5">
            {[product.brand, product.category].filter(Boolean).join(' · ') || 'Uncategorised'} ·{' '}
            {product.supplierCount} supplier{product.supplierCount === 1 ? '' : 's'}
          </p>
        </div>
        {product.fromPrice && (
          <p className="shrink-0 text-[0.8125rem] text-text-secondary">
            from{' '}
            <strong className="text-base font-bold tabular-nums text-accent-primary">
              <Money value={product.fromPrice} />
            </strong>
          </p>
        )}
      </div>

      <div className="space-y-3">
        {product.suppliers.map((row) => (
          <SupplierOfferRow
            key={row.listing_id}
            row={row}
            tiers={tiersByListing?.get(row.listing_id)}
          />
        ))}
      </div>
    </section>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[0.8125rem] font-semibold text-text-primary">{label}</p>
      {children}
    </div>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[0.8125rem] text-text-secondary">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  )
}


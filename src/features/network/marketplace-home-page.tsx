import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Package, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import {
  useMarketplace,
  useMarketplaceCategories,
  type MarketplaceProduct,
} from '@/features/network/use-network'
import { useRestockSuggestions, type RestockSuggestion } from '@/features/procurement/use-restock'
import { cn } from '@/lib/utils'

/**
 * The workspace entry point — a BUYER's browse surface.
 *
 * Deliberately says nothing about what this business sells. Someone arriving
 * here is looking for something to buy; their own storefront and listings live
 * under My listings, and putting them here made the page about the wrong
 * person. The one place the two sides meet is the sidebar.
 *
 * The restock strip is the only thing on this screen that reads private data
 * (`restock_suggestions`, per-business, RLS-scoped). It stays on this side of
 * the boundary: it turns "I am low on flour" into a marketplace search. No
 * supplier ever sees it.
 */
export function MarketplaceHomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data: categories } = useMarketplaceCategories()
  const { products, isLoading } = useMarketplace({})
  const { data: restock, isLoading: restockLoading } = useRestockSuggestions()

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    navigate(term ? `/network/search?q=${encodeURIComponent(term)}` : '/network/search')
  }

  // One row per product, worst-stocked first — the restock RPC returns a row
  // per variant/supplier pairing, and the same product must not appear twice.
  const restockProducts = useMemo(() => {
    const seen = new Map<string, RestockSuggestion>()
    for (const row of restock ?? []) {
      if (!seen.has(row.product_name)) seen.set(row.product_name, row)
    }
    return [...seen.values()].slice(0, 4)
  }, [restock])

  return (
    <div className="mx-auto max-w-6xl">
      {/* The search box is the page. No page title above it — the breadcrumb
          and the sidebar already say where you are, and a heading here would
          push the one thing people came to do below the fold. */}
      <form onSubmit={submitSearch} className="mb-4">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-2 pl-5 shadow-e2">
          <Search className="size-5 shrink-0 text-icon" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, suppliers, categories, or SKUs"
            aria-label="Search the supplier network"
            className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="lg" className="shrink-0">
            Search
          </Button>
        </div>
      </form>

      <div className="mb-9 flex flex-wrap gap-2">
        <QuickAction to="/network/search">Find a product</QuickAction>
        <QuickAction to="/network/search?view=suppliers">Find a supplier</QuickAction>
        <QuickAction to="/network/connections">My connections</QuickAction>
        <QuickAction to="/network/messages">My messages</QuickAction>
        {(categories ?? []).slice(0, 4).map((category) => (
          <QuickAction key={category} to={`/network/search?category=${encodeURIComponent(category)}`}>
            {category}
          </QuickAction>
        ))}
      </div>

      {/* Restock — the bridge from the Business OS into the marketplace. */}
      {(restockLoading || restockProducts.length > 0) && (
        <section className="mb-9">
          <h2 className="type-title">You may need to restock</h2>
          <p className="type-meta mt-0.5 mb-3">Based on current stock levels in Inventory</p>

          {restockLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {restockProducts.map((row) => (
                <RestockCard key={row.variant_id} row={row} />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="type-title">Available on the network</h2>
        <p className="type-meta mt-0.5 mb-3">
          Products other businesses are selling right now
        </p>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center shadow-e2">
            <Package className="mx-auto size-8 text-icon-muted" aria-hidden="true" />
            <p className="type-heading mt-3">Nothing listed yet</p>
            <p className="type-body mt-1">
              Suppliers appear here as soon as they publish. If you sell to other businesses, you
              can be listed today.
            </p>
            <Button asChild className="mt-4">
              <Link to="/network/my-profile">Sell on the network</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.slice(0, 6).map((product) => (
                <ProductTile key={product.canonicalProductId} product={product} />
              ))}
            </div>
            {products.length > 6 && (
              <Button variant="outline" asChild className="mt-4">
                <Link to="/network/search">See all {products.length} products</Link>
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function QuickAction({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full bg-card px-4 py-2.5 text-[0.8125rem] font-semibold text-text-primary shadow-e1 transition-shadow hover:shadow-e2"
    >
      {children}
    </Link>
  )
}

/**
 * A low-stock line, with the one action that resolves it.
 *
 * The bar is a stock-vs-target ratio, not a percentage of anything the user
 * set, so it is labelled in units on both ends rather than shown as a bare
 * percentage that would invite over-reading.
 */
function RestockCard({ row }: { row: RestockSuggestion }) {
  const onHand = new Decimal(row.qty_on_hand)
  const target = new Decimal(row.low_stock_threshold)
  // Guard the divide: a zero threshold is legal in the schema and would make
  // this NaN, which renders as an empty bar with no explanation.
  const ratio = target.gt(0)
    ? Math.min(100, Math.max(0, onHand.div(target).times(100).toNumber()))
    : onHand.gt(0)
      ? 100
      : 0
  const critical = ratio < 50

  return (
    <div className="rounded-2xl bg-card p-4 shadow-e2">
      <p className="type-heading truncate">
        {row.product_name}
        {row.variant_name ? ` · ${row.variant_name}` : ''}
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="text-text-secondary">
          In stock:{' '}
          <strong className={cn('font-semibold', critical ? 'text-danger' : 'text-text-primary')}>
            {onHand.toString()} {row.purchase_unit ?? ''}
          </strong>
        </span>
        <span className="text-text-muted">
          Suggested: {new Decimal(row.suggested_qty_base).toString()} {row.purchase_unit ?? ''}
        </span>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${onHand.toString()} in stock against a threshold of ${target.toString()}`}
      >
        <div
          className={cn('h-full rounded-full', critical ? 'bg-danger' : 'bg-warning')}
          style={{ width: `${ratio}%` }}
        />
      </div>

      <Button asChild className="mt-4">
        {/* Searches the marketplace for it — the whole point of the strip. */}
        <Link to={`/network/search?q=${encodeURIComponent(row.product_name)}`}>Find suppliers</Link>
      </Button>
    </div>
  )
}

function ProductTile({ product }: { product: MarketplaceProduct }) {
  return (
    <Link
      to={`/network/products/${product.canonicalProductId}`}
      className="flex min-w-0 flex-col rounded-2xl bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3"
    >
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-tint-accent/60">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Package className="size-8 text-tint-accent-foreground/50" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 px-1 pb-0.5 pt-3">
        <p className="type-heading truncate">{product.productName}</p>
        <p className="type-meta mt-0.5 truncate">
          {product.brand ?? product.category ?? 'Uncategorised'}
        </p>

        <p className="mt-2 text-base font-bold text-accent-primary">
          {product.fromPrice ? <Money value={product.fromPrice} /> : 'Price on request'}
        </p>
        <p className="type-meta mt-0.5">
          {product.supplierCount} supplier{product.supplierCount === 1 ? '' : 's'}
        </p>

        {product.suppliers.some((s) => s.from_price !== null) && (
          <Badge variant="success" className="mt-2.5">
            Wholesale pricing available
          </Badge>
        )}
      </div>
    </Link>
  )
}

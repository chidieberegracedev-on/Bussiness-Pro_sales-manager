import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import { ArrowLeft, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import { useMarketplace, useListingTiersFor } from '@/features/network/use-network'
import { SupplierOfferRow } from '@/features/network/supplier-offer-row'

/**
 * A CANONICAL PRODUCT and everyone who sells it.
 *
 * Distinct from the listing detail page, and the distinction is the point of
 * the catalog: this page is "Premium Flour 50kg, from five suppliers"; a
 * listing page is "this supplier's offer of it". A buyer comparing prices
 * wants the former, and building only the latter is what forced them to open
 * five tabs.
 */
export function NetworkProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Reuses the marketplace read, filtered to one product — no second query
  // shape, so the grid and this page can never disagree about a price.
  const { products, isLoading } = useMarketplace({ canonicalProductId: id })
  const product = products[0] ?? null

  const listingIds = useMemo(
    () => (product?.suppliers ?? []).map((s) => s.listing_id),
    [product],
  )
  const { data: tiersByListing } = useListingTiersFor(listingIds)

  const priceRange = useMemo(() => {
    const prices = (product?.suppliers ?? [])
      .map((s) => s.from_price)
      .filter((p): p is string => p !== null)
      .map((p) => new Decimal(p))
    if (prices.length === 0) return null
    return {
      min: Decimal.min(...prices),
      max: Decimal.max(...prices),
    }
  }, [product])

  const regions = useMemo(
    () =>
      new Set(
        (product?.suppliers ?? [])
          .map((s) => s.location_text)
          .filter((l): l is string => !!l),
      ).size,
    [product],
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  if (!product) {
    return (
      <EmptyState
        icon={Package}
        title="That product isn't on the network"
        description="No supplier is currently listing it. It may have been withdrawn, or every supplier of it may have hidden their storefront."
        action={
          <Button onClick={() => navigate('/network/search')}>
            <ArrowLeft className="size-4" /> Back to search
          </Button>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" /> Back
      </Button>

      {/* Hero */}
      <div className="flex flex-wrap items-start gap-5 rounded-2xl bg-card p-5 shadow-e2">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/60">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <Package className="size-9 text-tint-accent-foreground/50" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="type-title text-2xl">{product.productName}</h1>
          <p className="type-meta mt-1">
            {[product.brand, product.category].filter(Boolean).join(' · ') || 'Uncategorised'}
          </p>

          <p className="mt-2.5 text-xl font-bold tabular-nums text-text-primary">
            {priceRange ? (
              priceRange.min.eq(priceRange.max) ? (
                <Money value={priceRange.min} />
              ) : (
                <>
                  <Money value={priceRange.min} /> – <Money value={priceRange.max} />
                </>
              )
            ) : (
              <span className="text-base font-semibold text-text-secondary">Price on request</span>
            )}
          </p>

          <p className="type-meta mt-1">
            {product.supplierCount} supplier{product.supplierCount === 1 ? '' : 's'} available
            {regions > 0 && ` · ${regions} location${regions === 1 ? '' : 's'}`}
          </p>

          {priceRange && (
            <Badge variant="success" className="mt-3">
              Wholesale pricing available
            </Badge>
          )}
        </div>
      </div>

      <h2 className="type-title mb-3 mt-8">Available from</h2>
      <div className="space-y-3">
        {product.suppliers.map((row) => (
          <SupplierOfferRow
            key={row.listing_id}
            row={row}
            tiers={tiersByListing?.get(row.listing_id)}
          />
        ))}
      </div>
    </div>
  )
}

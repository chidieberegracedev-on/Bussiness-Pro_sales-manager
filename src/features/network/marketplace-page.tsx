import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  Search,
  Store,
  Package,
  ChevronDown,
  Link2,
  Loader2,
  Check,
  Globe,
  ShieldCheck,
  Inbox,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import {
  useMarketplace,
  useMarketplaceCategories,
  useRequestConnection,
  useConnectionStatusMap,
  useMySupplierProfile,
  useIncomingConnections,
  type MarketplaceProduct,
  type MarketplaceRow,
} from '@/features/network/use-network'
import { VerificationBadge, TrustIndicators } from '@/features/network/trust-indicators'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * The trading floor.
 *
 * One card per CANONICAL PRODUCT, expandable to the suppliers offering it —
 * not one card per listing. That distinction is the whole reason the canonical
 * catalog exists: four suppliers selling Indomie is one product to compare,
 * not four products to scroll past.
 */
export function MarketplacePage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState<string | 'all'>('all')
  const debounced = useDebouncedValue(search, 300)
  const canonicalFilter = params.get('product') ?? undefined

  const { data: categories } = useMarketplaceCategories()
  const { products, isLoading, isError, refetch } = useMarketplace({
    search: debounced,
    category,
    canonicalProductId: canonicalFilter,
  })
  const { data: myProfile } = useMySupplierProfile()
  const { data: incoming } = useIncomingConnections()

  const pendingIncoming = (incoming ?? []).filter((c) => c.status === 'requested').length

  const stats = useMemo(
    () => ({
      products: products.length,
      suppliers: new Set(products.flatMap((p) => p.suppliers.map((s) => s.supplier_profile_id)))
        .size,
    }),
    [products],
  )

  return (
    <div>
      <PageHeader
        title="Network"
        description="Find suppliers, compare what they charge, and connect with the ones you want to buy from. Nothing here can see your costs, your margins, or your stock."
        actions={
          <div className="flex flex-wrap gap-2">
            {pendingIncoming > 0 && (
              <Button variant="outline" asChild>
                <Link to="/network/connections">
                  <Inbox className="size-4" /> {pendingIncoming} request
                  {pendingIncoming === 1 ? '' : 's'}
                </Link>
              </Button>
            )}
            <Button variant={myProfile ? 'outline' : 'default'} asChild>
              <Link to="/network/my-profile">
                <Store className="size-4" />
                {myProfile ? 'My storefront' : 'Sell on the network'}
              </Link>
            </Button>
          </div>
        }
      />

      {/* Stat tiles, reference-style: tinted icon, big number, quiet label. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Package} value={String(stats.products)} label="Products listed" />
        <StatTile icon={Store} value={String(stats.suppliers)} label="Suppliers" />
        <StatTile
          icon={ShieldCheck}
          value={myProfile ? (myProfile.verification === 'verified' ? 'Live' : 'Pending') : '—'}
          label="Your storefront"
          to="/network/my-profile"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, brands, or suppliers"
            className="pl-9"
            aria-label="Search the network"
          />
        </div>
        {canonicalFilter && (
          <Button
            variant="outline"
            onClick={() => {
              params.delete('product')
              setParams(params)
            }}
          >
            Clear product filter
          </Button>
        )}
      </div>

      {(categories ?? []).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
            All
          </CategoryChip>
          {(categories ?? []).map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </CategoryChip>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && products.length === 0 && (
        <EmptyState
          icon={Globe}
          title="Nothing on the network yet"
          description="Suppliers appear here once they publish a storefront and are verified. If you sell to other businesses, you can be one of the first."
          action={
            <Button asChild>
              <Link to="/network/my-profile">
                <Store className="size-4" /> Sell on the network
              </Link>
            </Button>
          }
        />
      )}

      {!isLoading && !isError && products.length > 0 && (
        <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.canonicalProductId} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatTile({
  icon: Icon,
  value,
  label,
  to,
}: {
  icon: typeof Package
  value: string
  label: string
  to?: string
}) {
  const body = (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xl font-bold tabular-nums text-text-primary">{value}</p>
        <p className="truncate text-xs text-text-muted">{label}</p>
      </div>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
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
        'min-h-9 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-transparent bg-text-primary font-semibold text-background'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

function ProductCard({ product }: { product: MarketplaceProduct }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? product.suppliers : product.suppliers.slice(0, 2)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 items-start gap-3 p-3">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <Package className="size-6 text-text-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{product.productName}</p>
          <p className="truncate text-xs text-text-muted">
            {product.brand ?? product.category ?? 'Uncategorised'}
          </p>
          <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            {product.fromPrice ? (
              <>
                <span className="text-xs text-text-secondary">from</span>
                <span className="truncate text-sm font-semibold text-accent-primary">
                  <Money value={product.fromPrice} />
                </span>
              </>
            ) : (
              <span className="text-xs text-text-muted">Price on request</span>
            )}
          </p>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <p className="text-xs font-medium text-text-secondary">
          {product.supplierCount} supplier{product.supplierCount === 1 ? '' : 's'} offering this
        </p>
      </div>

      <ul className="divide-y divide-border">
        {visible.map((row) => (
          <SupplierOffer key={row.listing_id} row={row} />
        ))}
      </ul>

      {product.suppliers.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-auto flex items-center justify-center gap-1 border-t border-border py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
        >
          {expanded ? 'Show fewer' : `Compare all ${product.suppliers.length}`}
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

function SupplierOffer({ row }: { row: MarketplaceRow }) {
  const statusMap = useConnectionStatusMap()
  const request = useRequestConnection()
  const existing = statusMap.get(row.supplier_profile_id)

  function connect() {
    request.mutate(row.supplier_profile_id, {
      onSuccess: () =>
        toast({
          title: 'Request sent',
          description: `${row.supplier_name} will see your request and can accept it.`,
        }),
      onError: (e) =>
        toast({
          variant: 'destructive',
          title: "Couldn't send that request",
          description: toReadableError(e),
        }),
    })
  }

  return (
    <li className="min-w-0 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/network/suppliers/${row.supplier_profile_id}`}
            className="block truncate text-sm font-medium text-text-primary hover:underline"
          >
            {row.supplier_name}
          </Link>
          <p className="truncate text-xs text-text-muted">
            {row.location_text ?? 'Location not given'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {row.from_price ? (
            <p className="text-sm font-semibold tabular-nums text-accent-primary">
              <Money value={row.from_price} />
            </p>
          ) : (
            <p className="text-xs text-text-muted">On request</p>
          )}
          <p className="text-xs text-text-muted">per {row.purchase_unit}</p>
        </div>
      </div>

      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <VerificationBadge verification={row.verification} />
        <TrustIndicators
          facts={{
            completed_orders: row.completed_orders,
            fulfillment_rate: row.fulfillment_rate,
          }}
          compact
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          Min order {new Decimal(row.min_order_qty).toString()} {row.purchase_unit}
        </p>
        <div className="flex gap-1.5">
          {existing?.status === 'accepted' ? (
            <Button size="sm" variant="outline" disabled>
              <Check className="size-3.5" /> Connected
            </Button>
          ) : existing?.status === 'requested' ? (
            <Button size="sm" variant="outline" disabled>
              <Loader2 className="size-3.5" /> Requested
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={connect} disabled={request.isPending}>
              <Link2 className="size-3.5" /> Connect
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

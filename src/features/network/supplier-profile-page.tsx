import { useNavigate, useParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  ArrowLeft,
  Store,
  MapPin,
  Package,
  Link2,
  Check,
  Loader2,
  Phone,
  Mail,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/data/error-state'
import {
  useSupplierProfile,
  useSupplierListings,
  useRequestConnection,
  useConnectionStatusMap,
  type ListingWithTiers,
} from '@/features/network/use-network'
import {
  VerificationBadge,
  TrustTierBadge,
  TrustIndicators,
  TIER_MEANING,
} from '@/features/network/trust-indicators'
import { BuyerProtectionNotice } from '@/features/network/buyer-protection'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * A supplier's public storefront.
 *
 * Everything shown here is data the supplier chose to publish. There is no
 * path from this screen to anything private — not theirs, not ours.
 */
export function SupplierProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const { data: profile, isLoading, isError } = useSupplierProfile(id)
  const { data: listings, isLoading: listingsLoading } = useSupplierListings(id)
  const statusMap = useConnectionStatusMap()
  const request = useRequestConnection()

  const isMine = !!profile && profile.business_id === business?.id
  const existing = id ? statusMap.get(id) : undefined

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (isError || !profile) {
    return (
      <ErrorState
        error={new Error('Supplier not found')}
        onRetry={() => navigate('/network')}
      />
    )
  }

  function connect() {
    if (!id) return
    request.mutate(id, {
      onSuccess: () =>
        toast({
          title: 'Request sent',
          description: 'They can accept it from their end, and then they appear in your Suppliers.',
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
    <div>
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/network')}>
        <ArrowLeft className="size-4" /> Network
      </Button>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-start gap-4 pt-6">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="" className="size-full object-cover" />
            ) : (
              <Store className="size-7 text-text-muted" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-text-primary">
                {profile.display_name}
              </h1>
              <TrustTierBadge tier={profile.trust_tier} />
              {profile.verification === 'verified' && (
                <VerificationBadge verification={profile.verification} />
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted">{TIER_MEANING[profile.trust_tier]}</p>
            {profile.location_text && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-text-secondary">
                <MapPin className="size-3.5 text-text-muted" /> {profile.location_text}
              </p>
            )}
            {profile.description && (
              <p className="mt-2 max-w-prose text-sm text-text-secondary">{profile.description}</p>
            )}
            <TrustIndicators facts={profile} className="mt-3" />
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {isMine ? (
              <Button variant="outline" onClick={() => navigate('/network/my-profile')}>
                Edit storefront
              </Button>
            ) : existing?.status === 'accepted' ? (
              <Button variant="outline" disabled>
                <Check className="size-4" /> Connected
              </Button>
            ) : existing?.status === 'requested' ? (
              <Button variant="outline" disabled>
                <Loader2 className="size-4" /> Request sent
              </Button>
            ) : (
              <Button onClick={connect} disabled={request.isPending}>
                <Link2 className="size-4" /> Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {(profile.contact_phone || profile.contact_email || profile.min_order_note) && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-6 text-sm">
            {profile.contact_phone && (
              <span className="flex items-center gap-1.5 text-text-secondary">
                <Phone className="size-3.5 text-text-muted" /> {profile.contact_phone}
              </span>
            )}
            {profile.contact_email && (
              <span className="flex items-center gap-1.5 text-text-secondary">
                <Mail className="size-3.5 text-text-muted" /> {profile.contact_email}
              </span>
            )}
            {profile.min_order_note && (
              <span className="flex items-center gap-1.5 text-text-secondary">
                <Truck className="size-3.5 text-text-muted" /> {profile.min_order_note}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <BuyerProtectionNotice className="mb-4" />

      <h2 className="mb-3 text-base font-semibold text-text-primary">
        What they sell{listings && listings.length > 0 && ` (${listings.length})`}
      </h2>

      {listingsLoading && <Skeleton className="h-48 w-full rounded-xl" />}

      {!listingsLoading && (listings ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Package className="mx-auto size-8 text-text-muted" />
          <p className="mt-2 text-sm font-medium text-text-primary">Nothing listed yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            This supplier hasn't published any products.
          </p>
        </div>
      )}

      {!listingsLoading && (listings ?? []).length > 0 && (
        <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
          {(listings ?? []).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A listing with its wholesale price breaks.
 *
 * The tiers are the point: "cheaper if you buy more" is how wholesale actually
 * works, and a single price hides the decision a buyer is trying to make.
 */
function ListingCard({ listing }: { listing: ListingWithTiers }) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 items-start gap-3 p-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
          {listing.product?.image_url ? (
            <img src={listing.product.image_url} alt="" className="size-full object-cover" />
          ) : (
            <Package className="size-5 text-text-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {listing.supplier_product_name ?? listing.product?.name ?? 'Product'}
          </p>
          <p className="truncate text-xs text-text-muted">
            {listing.product?.brand ?? listing.product?.category ?? 'Uncategorised'}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Sold per {listing.purchase_unit}
            {Number(listing.conversion_to_base) !== 1 && (
              <> · 1 {listing.purchase_unit} = {new Decimal(listing.conversion_to_base).toString()}{' '}
                {listing.product?.base_unit ?? 'unit'}</>
            )}
          </p>
        </div>
      </div>

      {listing.tiers.length > 0 ? (
        <ul className="mt-auto divide-y divide-border border-t border-border">
          {listing.tiers.map((tier) => (
            <li
              key={tier.id}
              className="flex min-w-0 items-center justify-between gap-2 px-3 py-1.5 text-sm"
            >
              <span className="truncate text-text-secondary">
                {tierLabel(tier.min_qty, tier.max_qty, listing.purchase_unit)}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-accent-primary">
                <Money value={tier.unit_price} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-auto border-t border-border px-3 py-2 text-xs text-text-muted">
          No published prices — ask for a quote.
        </p>
      )}

      <p className="border-t border-border px-3 py-2 text-xs text-text-muted">
        Minimum order {new Decimal(listing.min_order_qty).toString()} {listing.purchase_unit}
        {listing.availability !== 'active' && ' · currently unavailable'}
      </p>
    </div>
  )
}

function tierLabel(min: string, max: string | null, unit: string): string {
  const from = new Decimal(min).toString()
  if (!max) return `${from}+ ${unit}`
  return `${from}–${new Decimal(max).toString()} ${unit}`
}

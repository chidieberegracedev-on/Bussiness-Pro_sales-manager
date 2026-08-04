import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/data/error-state'
import {
  useSupplierProfile,
  useSupplierListings,
  useRequestConnection,
  useConnectionStatusMap,
  useThreadWithSupplier,
  useListingImageMap,
  type ListingWithTiers,
} from '@/features/network/use-network'
import { MessageSupplierDialog } from '@/features/network/message-supplier-dialog'
import {
  VerificationBadge,
  TrustTierBadge,
  TrustIndicators,
  TIER_MEANING,
  normaliseTier,
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
  const existingThread = useThreadWithSupplier(id)
  const { data: imageMap } = useListingImageMap((listings ?? []).map((l) => l.id))
  const [messageOpen, setMessageOpen] = useState(false)

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

      {/* The storefront header is the identity block, so it gets the one
          tinted surface on the page — the store mark sits in a circular badge
          on white, and the trust facts as pills on top of the tint. */}
      <div className="mb-4 rounded-2xl bg-tint-accent p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface shadow-e1">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="" className="size-full object-cover" />
            ) : (
              <Store className="size-7 text-tint-accent-foreground" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-text-primary">
                {profile.display_name}
              </h1>
              <TrustTierBadge tier={profile.trust_tier} className="bg-surface/80" />
              {profile.verification === 'verified' && (
                <VerificationBadge verification={profile.verification} />
              )}
            </div>
            <p className="mt-1.5 text-xs text-tint-accent-foreground">
              {TIER_MEANING[normaliseTier(profile.trust_tier)]}
            </p>
            {profile.location_text && (
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <MapPin className="size-3.5 text-tint-accent-foreground" /> {profile.location_text}
              </p>
            )}
            {profile.description && (
              <p className="mt-2 max-w-prose text-sm text-text-secondary">{profile.description}</p>
            )}
            <TrustIndicators facts={profile} className="mt-3.5" />
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {isMine ? (
              <Button variant="outline" className="bg-surface" onClick={() => navigate('/network/my-profile')}>
                Edit storefront
              </Button>
            ) : existing?.status === 'accepted' ? (
              <Button variant="outline" className="bg-surface" disabled>
                <Check className="size-4" /> Connected
              </Button>
            ) : existing?.status === 'requested' ? (
              <Button variant="outline" className="bg-surface" disabled>
                <Loader2 className="size-4" /> Request sent
              </Button>
            ) : (
              <Button onClick={connect} disabled={request.isPending}>
                <Link2 className="size-4" /> Connect
              </Button>
            )}
            {!isMine && id && (
              existingThread ? (
                <Button variant="outline" className="bg-surface" asChild>
                  <Link to={`/network/messages/${existingThread.id}`}>
                    <MessageSquare className="size-4" /> Open conversation
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="bg-surface"
                  onClick={() => setMessageOpen(true)}
                >
                  <MessageSquare className="size-4" /> Message
                </Button>
              )
            )}
          </div>
        </div>

        {(profile.contact_phone || profile.contact_email || profile.min_order_note) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-tint-accent-foreground/15 pt-4 text-sm">
            {profile.contact_phone && (
              <ContactChip icon={Phone}>{profile.contact_phone}</ContactChip>
            )}
            {profile.contact_email && (
              <ContactChip icon={Mail}>{profile.contact_email}</ContactChip>
            )}
            {profile.min_order_note && (
              <ContactChip icon={Truck}>{profile.min_order_note}</ContactChip>
            )}
          </div>
        )}
      </div>

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
            <ListingCard
              key={listing.id}
              listing={listing}
              // The supplier's own photo beats the shared catalog picture:
              // it's what will actually arrive.
              imageUrl={imageMap?.get(listing.id) ?? listing.product?.image_url ?? undefined}
            />
          ))}
        </div>
      )}

      {messageOpen && profile && id && (
        <MessageSupplierDialog
          supplierProfileId={id}
          supplierName={profile.display_name}
          onClose={() => setMessageOpen(false)}
        />
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
function ListingCard({
  listing,
  imageUrl,
}: {
  listing: ListingWithTiers
  imageUrl?: string
}) {
  return (
    <Link
      to={`/network/listings/${listing.id}`}
      className="flex h-full min-w-0 flex-col rounded-2xl bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3"
    >
      <div className="flex min-w-0 items-start gap-3">
        {/* The image well is the focal shape — larger radius than the card's
            inner controls, on a tint rather than another gray square. */}
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/60">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <Package className="size-6 text-tint-accent-foreground/60" />
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

      {/* The price breaks are the reason a buyer is on this card, so they get
          their own recessed surface rather than three more hairline rules. */}
      {listing.tiers.length > 0 ? (
        <ul className="mt-3 space-y-0.5 rounded-xl bg-background p-2">
          {listing.tiers.map((tier) => (
            <li
              key={tier.id}
              className="flex min-w-0 items-center justify-between gap-2 px-1 py-1 text-sm"
            >
              <span className="truncate text-text-secondary">
                {tierLabel(tier.min_qty, tier.max_qty, listing.purchase_unit)}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-accent-primary">
                <Money value={tier.unit_price} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-background px-3 py-2 text-xs text-text-muted">
          No published prices — ask for a quote.
        </p>
      )}

      <p className="mt-auto px-1 pt-2.5 text-xs text-text-muted">
        Minimum order {new Decimal(listing.min_order_qty).toString()} {listing.purchase_unit}
        {listing.availability !== 'active' && ' · currently unavailable'}
      </p>
    </Link>
  )
}

/** A contact fact, on its own white pill so it reads against the tinted header. */
function ContactChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm text-text-secondary shadow-e1">
      <Icon className="size-3.5 shrink-0 text-accent-primary" />
      <span className="truncate">{children}</span>
    </span>
  )
}

function tierLabel(min: string, max: string | null, unit: string): string {
  const from = new Decimal(min).toString()
  if (!max) return `${from}+ ${unit}`
  return `${from}–${new Decimal(max).toString()} ${unit}`
}

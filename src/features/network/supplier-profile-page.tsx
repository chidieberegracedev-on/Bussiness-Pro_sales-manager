import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Link2,
  Loader2,
  MessageSquare,
  Package,
  Store,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
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
import { TrustTierBadge, VerificationBadge, TIER_MEANING, normaliseTier } from '@/features/network/trust-indicators'
import { BuyerProtectionNotice } from '@/features/network/buyer-protection'
import { formatMinutes, tierLabel } from '@/features/network/supplier-offer-row'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDate } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * A supplier's public storefront.
 *
 * Everything here is data the supplier chose to publish. There is no path from
 * this screen to anything private — not theirs, not ours.
 *
 * Layout follows the reference: identity and the primary action at the top,
 * then a two-column body — what they say about themselves and what they sell
 * on the left, the evidence for trusting them on the right. Trust sits in its
 * own column because it is what a buyer scans while reading everything else.
 */
export function SupplierProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const locale = useLocale()
  const { business, role } = useActiveBusiness()
  const canMessage = role === 'owner' || role === 'manager'

  const { data: profile, isLoading, isError } = useSupplierProfile(id)
  const { data: listings, isLoading: listingsLoading } = useSupplierListings(id)
  const statusMap = useConnectionStatusMap()
  const request = useRequestConnection()
  const existingThread = useThreadWithSupplier(id)
  const { data: imageMap } = useListingImageMap((listings ?? []).map((l) => l.id))
  const [messageOpen, setMessageOpen] = useState(false)

  const isMine = !!profile && profile.business_id === business?.id
  const existing = id ? statusMap.get(id) : undefined

  const deliveryAreas = useMemo(
    () => (profile?.delivery_areas ?? []).filter(Boolean),
    [profile],
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !profile) {
    return <ErrorState error={new Error('Supplier not found')} onRetry={() => navigate('/network/search')} />
  }

  function connect() {
    if (!id) return
    request.mutate(id, {
      onSuccess: () =>
        toast({
          title: 'Request sent',
          description: 'They can accept it, and then they appear in your Suppliers.',
        }),
      onError: (e) =>
        toast({
          variant: 'destructive',
          title: "Couldn't send that request",
          description: toReadableError(e),
        }),
    })
  }

  const initials = profile.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return (
    <div className="mx-auto max-w-5xl">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" /> Back
      </Button>

      {/* Identity + the one primary action */}
      <div className="flex flex-wrap items-start gap-4 rounded-2xl bg-card p-5 shadow-e2">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint-accent text-base font-bold text-tint-accent-foreground">
          {profile.logo_url ? (
            <img src={profile.logo_url} alt="" className="size-full object-cover" />
          ) : (
            initials || <Store className="size-6" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="type-title text-2xl">{profile.display_name}</h1>
            <TrustTierBadge tier={profile.trust_tier} />
            {profile.verification === 'verified' && (
              <VerificationBadge verification={profile.verification} />
            )}
          </div>
          <p className="type-meta mt-1">
            {[
              profile.location_text,
              `Member since ${formatDate(profile.created_at, business?.timezone ?? 'UTC', locale)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="type-meta mt-1 max-w-prose">
            {TIER_MEANING[normaliseTier(profile.trust_tier)]}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isMine ? (
            <Button variant="outline" asChild>
              <Link to="/network/my-profile">Edit storefront</Link>
            </Button>
          ) : (
            <>
              {existing?.status === 'accepted' ? (
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
              {canMessage &&
                id &&
                (existingThread ? (
                  <Button variant="outline" asChild>
                    <Link to={`/network/messages/${existingThread.id}`}>
                      <MessageSquare className="size-4" /> Open conversation
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setMessageOpen(true)}>
                    <MessageSquare className="size-4" /> Contact
                  </Button>
                ))}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Left: what they say, where they deliver, what they sell */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl bg-card p-5 shadow-e2">
            <h2 className="type-heading">About</h2>
            {profile.description ? (
              <p className="type-body mt-1.5 max-w-prose">{profile.description}</p>
            ) : (
              <p className="type-meta mt-1.5">
                This supplier hasn't written a description yet.
              </p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label="Typical response"
                value={
                  profile.avg_response_minutes != null
                    ? formatMinutes(profile.avg_response_minutes)
                    : 'No data yet'
                }
              />
              <Stat label="Completed orders" value={String(profile.completed_orders)} />
              <Stat
                label="Products listed"
                value={String((listings ?? []).filter((l) => l.availability === 'active').length)}
              />
            </dl>
          </section>

          {deliveryAreas.length > 0 && (
            <section className="rounded-2xl bg-card p-5 shadow-e2">
              <h2 className="type-heading">Delivery areas</h2>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {deliveryAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-background px-3 py-1.5 text-[0.8125rem] font-medium text-text-secondary"
                  >
                    {area}
                  </span>
                ))}
              </div>
              {profile.min_order_note && (
                <p className="type-meta mt-3">{profile.min_order_note}</p>
              )}
            </section>
          )}

          <section className="rounded-2xl bg-card p-5 shadow-e2">
            <h2 className="type-heading">
              Products supplied
              {(listings ?? []).length > 0 && (
                <span className="ml-1.5 font-normal text-text-muted">({listings?.length})</span>
              )}
            </h2>

            {listingsLoading && <Skeleton className="mt-3 h-28 w-full rounded-xl" />}

            {!listingsLoading && (listings ?? []).length === 0 && (
              <p className="type-meta mt-2">This supplier hasn't published any products yet.</p>
            )}

            <div className="mt-3 space-y-3">
              {(listings ?? []).map((listing) => (
                <ProductSuppliedRow
                  key={listing.id}
                  listing={listing}
                  imageUrl={imageMap?.get(listing.id) ?? listing.product?.image_url ?? undefined}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Right: the evidence column */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl bg-card p-5 shadow-e2">
            <h2 className="type-heading">Supplier trust</h2>
            <ul className="mt-3 space-y-2">
              <TrustLine
                met={profile.verification === 'verified'}
                label="Business identity verified"
                pending="Verification pending"
              />
              <TrustLine met={!!profile.contact_phone} label="Phone provided" pending="No phone published" />
              <TrustLine
                met={!!profile.location_text}
                label="Location published"
                pending="No location published"
              />
              <TrustLine
                met={profile.completed_orders > 0}
                label={`${profile.completed_orders} completed marketplace order${profile.completed_orders === 1 ? '' : 's'}`}
                pending="No completed orders yet"
              />
              <TrustLine
                met={profile.fulfillment_rate != null}
                label={
                  profile.fulfillment_rate != null
                    ? `${Number(profile.fulfillment_rate).toFixed(0)}% successful delivery rate`
                    : ''
                }
                pending="No delivery history yet"
              />
              <TrustLine
                met={profile.repeat_customers > 0}
                label={`${profile.repeat_customers} repeat buyer${profile.repeat_customers === 1 ? '' : 's'}`}
                pending="No repeat buyers yet"
              />
            </ul>

            {/* No composite score. Inventing "4.6 / 5" before there are orders
                behind it looks authoritative, can't be argued with, and a buyer
                would spend money on it. */}
            <p className="type-meta mt-3.5">
              Shown as separate facts on purpose — there is no single rating until the network has
              real trading behind it.
            </p>
          </section>

          <BuyerProtectionNotice />
        </aside>
      </div>

      {messageOpen && id && (
        <MessageSupplierDialog
          supplierProfileId={id}
          supplierName={profile.display_name}
          onClose={() => setMessageOpen(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-meta truncate">{label}</dt>
      <dd className="mt-0.5 truncate text-[0.9375rem] font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

/**
 * A trust fact, shown whether or not it is met. Hiding the unmet ones would
 * make every new supplier look identical to a proven one with a shorter list.
 */
function TrustLine({ met, label, pending }: { met: boolean; label: string; pending: string }) {
  return (
    <li className="flex items-start gap-2 text-[0.8125rem]">
      {met ? (
        <BadgeCheck className="mt-px size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <span
          aria-hidden="true"
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-text-disabled"
        />
      )}
      <span className={met ? 'text-text-primary' : 'text-text-muted'}>{met ? label : pending}</span>
    </li>
  )
}

function ProductSuppliedRow({
  listing,
  imageUrl,
}: {
  listing: ListingWithTiers
  imageUrl?: string
}) {
  return (
    <Link
      to={`/network/listings/${listing.id}`}
      className="flex min-w-0 gap-3 rounded-xl bg-background p-3 transition-colors hover:bg-surface-muted"
    >
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-tint-accent/60">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Package className="size-5 text-tint-accent-foreground/60" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="type-heading truncate">
            {listing.supplier_product_name ?? listing.product?.name ?? 'Product'}
          </p>
          <p className="type-meta shrink-0">
            MOQ {new Decimal(listing.min_order_qty).toString()} {listing.purchase_unit}
          </p>
        </div>

        {listing.availability !== 'active' && (
          <Badge variant="warning" className="mt-1">
            {listing.availability === 'out_of_stock' ? 'Out of stock' : 'Hidden'}
          </Badge>
        )}

        {listing.tiers.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {listing.tiers.map((tier) => (
              <li
                key={tier.id}
                className="flex min-w-0 items-center justify-between gap-3 text-[0.8125rem]"
              >
                <span className="truncate text-text-muted">
                  {tierLabel(tier.min_qty, tier.max_qty, listing.purchase_unit)}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-text-primary">
                  <Money value={tier.unit_price} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-meta mt-1.5">No published price — ask for a quote.</p>
        )}
      </div>
    </Link>
  )
}

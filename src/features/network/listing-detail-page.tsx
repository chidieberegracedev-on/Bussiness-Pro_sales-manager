import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  ArrowLeft,
  Check,
  Clock,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Store,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Money } from '@/components/money/money'
import { EmptyState } from '@/components/data/empty-state'
import {
  useListingDetail,
  useListingImages,
  useListingTiers,
  useRequestConnection,
  useConnectionStatusMap,
  tierForQuantity,
  type ListingDetail,
} from '@/features/network/use-network'
import { MessageSupplierDialog } from '@/features/network/message-supplier-dialog'
import { TrustTierBadge, TrustIndicators, VerificationBadge } from '@/features/network/trust-indicators'
import { BuyerProtectionNotice } from '@/features/network/buyer-protection'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * One listing, in full.
 *
 * The screen a buyer needs before committing: what it is, what it costs at the
 * quantity they actually want, who is selling it, and a way to ask a question
 * without first minting a supplier record. Everything on it comes from the
 * public plane — nothing here can read the supplier's costs or stock, and
 * nothing the supplier sees can read the buyer's.
 */
export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const { data: listing, isLoading, isError } = useListingDetail(id)
  const { data: images } = useListingImages(id)
  const { data: tiers } = useListingTiers(id)
  const statusMap = useConnectionStatusMap()
  const request = useRequestConnection()

  const [activeImage, setActiveImage] = useState(0)
  const [messageOpen, setMessageOpen] = useState(false)
  const [qty, setQty] = useState<Decimal | null>(null)

  const isMine = !!listing && listing.supplier_business_id === business?.id
  const existing = listing ? statusMap.get(listing.supplier_profile_id) : undefined

  // Default to the minimum order: it is the smallest quantity the supplier
  // will actually accept, so anything less is a price for an order that
  // cannot be placed.
  const minOrder = listing ? new Decimal(listing.min_order_qty) : new Decimal(1)
  const quantity = qty ?? minOrder

  const activeTier = useMemo(
    () => tierForQuantity(tiers ?? [], quantity),
    [tiers, quantity],
  )

  // The gallery falls back to the canonical product photo — a supplier who has
  // not uploaded their own should still show the product, not an empty box.
  const gallery = useMemo(() => {
    const own = (images ?? []).map((i) => i.url).filter((u): u is string => !!u)
    if (own.length > 0) return own
    return listing?.canonical_image_url ? [listing.canonical_image_url] : []
  }, [images, listing])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !listing) {
    return (
      <EmptyState
        icon={Package}
        title="That listing isn't available"
        description="It may have been removed, or the supplier may have hidden their storefront."
        action={
          <Button onClick={() => navigate('/network')}>
            <ArrowLeft className="size-4" /> Back to the network
          </Button>
        }
      />
    )
  }

  function connect() {
    if (!listing) return
    request.mutate(listing.supplier_profile_id, {
      onSuccess: () =>
        toast({
          title: 'Request sent',
          description: 'Once they accept, they appear in your Suppliers and you can raise orders.',
        }),
      onError: (e) =>
        toast({
          variant: 'destructive',
          title: "Couldn't send that request",
          description: toReadableError(e),
        }),
    })
  }

  const lineTotal = activeTier ? new Decimal(activeTier.unit_price).times(quantity) : null

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" /> Back
      </Button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Gallery */}
        <div>
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-tint-accent/60 shadow-e2">
            {gallery[activeImage] ? (
              <img
                src={gallery[activeImage]}
                alt={listing.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="text-center">
                <Package className="mx-auto size-12 text-tint-accent-foreground/50" />
                <p className="mt-2 text-sm text-tint-accent-foreground/80">No photo yet</p>
              </div>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {gallery.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-pressed={i === activeImage}
                  className={cn(
                    'size-16 overflow-hidden rounded-xl transition-shadow',
                    i === activeImage ? 'ring-2 ring-accent-primary' : 'shadow-e1 hover:shadow-e2',
                  )}
                >
                  <img src={url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* The offer */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {listing.brand && (
              <span className="text-sm font-medium text-text-secondary">{listing.brand}</span>
            )}
            {listing.availability !== 'active' && (
              <Badge variant="warning">
                {listing.availability === 'out_of_stock' ? 'Out of stock' : 'Hidden'}
              </Badge>
            )}
            {isMine && <Badge variant="info">Your listing</Badge>}
          </div>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
            {listing.title}
          </h1>
          {listing.canonical_name !== listing.title && (
            <p className="mt-0.5 text-sm text-text-muted">
              Catalogued as {listing.canonical_name}
            </p>
          )}

          {/* The price the chosen quantity actually lands on — not "from". */}
          <div className="mt-4 rounded-2xl bg-tint-accent p-4">
            {activeTier ? (
              <>
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-accent-primary">
                    <Money value={activeTier.unit_price} />
                  </span>
                  <span className="text-sm text-tint-accent-foreground">
                    per {listing.purchase_unit}
                  </span>
                </p>
                <p className="mt-1 text-xs text-tint-accent-foreground">
                  At {quantity.toString()} {listing.purchase_unit}
                  {quantity.eq(1) ? '' : 's'} — {lineTotal && <Money value={lineTotal} />} total
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-tint-accent-foreground">
                {(tiers ?? []).length === 0
                  ? 'No published prices — message the supplier for a quote.'
                  : `No price band covers ${quantity.toString()} ${listing.purchase_unit}. Ask for a quote at this quantity.`}
              </p>
            )}
          </div>

          {/* Price breaks */}
          {(tiers ?? []).length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-text-primary">Wholesale price breaks</p>
              {/* Same reason as SpecRow: this list is on the page, so it needs
                  a card surface rather than a recessed one. */}
              <ul className="overflow-hidden rounded-xl bg-card shadow-e1">
                {(tiers ?? []).map((tier) => {
                  const isActive = activeTier?.id === tier.id
                  return (
                    <li
                      key={tier.id}
                      className={cn(
                        'flex min-w-0 items-center justify-between gap-3 px-3.5 py-2.5 text-sm',
                        isActive && 'bg-tint-accent',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setQty(new Decimal(tier.min_qty))}
                        className="min-w-0 flex-1 truncate text-left text-text-secondary hover:text-text-primary"
                      >
                        {tierLabel(tier.min_qty, tier.max_qty, listing.purchase_unit)}
                      </button>
                      <span
                        className={cn(
                          'shrink-0 font-bold tabular-nums',
                          isActive ? 'text-tint-accent-foreground' : 'text-accent-primary',
                        )}
                      >
                        <Money value={tier.unit_price} />
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Quantity + actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-e1">
              <StepButton
                label="Decrease quantity"
                onClick={() => setQty(Decimal.max(minOrder, quantity.minus(1)))}
                disabled={quantity.lte(minOrder)}
              >
                <Minus className="size-4" />
              </StepButton>
              <span className="w-16 text-center text-sm font-semibold tabular-nums text-text-primary">
                {quantity.toString()}
              </span>
              <StepButton label="Increase quantity" onClick={() => setQty(quantity.plus(1))}>
                <Plus className="size-4" />
              </StepButton>
            </div>
            <p className="text-xs text-text-muted">
              Minimum order {minOrder.toString()} {listing.purchase_unit}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {isMine ? (
              <Button asChild>
                <Link to="/network/my-listings">Edit this listing</Link>
              </Button>
            ) : existing?.status === 'accepted' ? (
              <Button variant="outline" disabled>
                <Check className="size-4" /> Connected supplier
              </Button>
            ) : existing?.status === 'requested' ? (
              <Button variant="outline" disabled>
                <Loader2 className="size-4" /> Connection requested
              </Button>
            ) : (
              <Button onClick={connect} disabled={request.isPending}>
                <Link2 className="size-4" /> Connect to order
              </Button>
            )}
            {!isMine && (
              <Button variant="outline" onClick={() => setMessageOpen(true)}>
                <MessageSquare className="size-4" /> Ask a question
              </Button>
            )}
          </div>

          {!isMine && (
            <p className="mt-2 text-xs text-text-muted">
              Connecting adds them to your private Suppliers list so you can raise purchase orders.
              It shares nothing about your business beyond your name.
            </p>
          )}
        </div>
      </div>

      {/* Supplier card */}
      <div className="mt-8 rounded-2xl bg-card p-5 shadow-e2">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint-accent">
            {listing.supplier_logo_url ? (
              <img src={listing.supplier_logo_url} alt="" className="size-full object-cover" />
            ) : (
              <Store className="size-6 text-tint-accent-foreground" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/network/suppliers/${listing.supplier_profile_id}`}
                className="truncate text-lg font-bold text-text-primary hover:underline"
              >
                {listing.supplier_name}
              </Link>
              <TrustTierBadge tier={listing.trust_tier} />
              {listing.verification === 'verified' && (
                <VerificationBadge verification={listing.verification} />
              )}
            </div>
            {listing.location_text && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-text-secondary">
                <MapPin className="size-3.5 text-accent-primary" /> {listing.location_text}
              </p>
            )}
            <TrustIndicators facts={listing} className="mt-3" />
          </div>
          <Button variant="outline" asChild>
            <Link to={`/network/suppliers/${listing.supplier_profile_id}`}>
              Visit storefront
            </Link>
          </Button>
        </div>
      </div>

      {/* Specifics */}
      <Tabs defaultValue="details" className="mt-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="delivery">Ordering &amp; delivery</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {listing.description ? (
            <p className="max-w-prose whitespace-pre-line text-sm text-text-secondary">
              {listing.description}
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              The supplier hasn't written a description for this listing yet.
            </p>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <SpecRow label="Sold in" value={listing.purchase_unit} />
            {/* No pluralising: a base unit is a symbol the business chose
                ("kg", "L", "pcs"), and "25 kgs" is wrong in every locale. */}
            <SpecRow
              label={`${listing.base_unit} per ${listing.purchase_unit}`}
              value={new Decimal(listing.conversion_to_base).toString()}
            />
            {listing.pack_description && (
              <SpecRow label="Packing" value={listing.pack_description} />
            )}
            {listing.brand && <SpecRow label="Brand" value={listing.brand} />}
            {listing.category && <SpecRow label="Category" value={listing.category} />}
          </dl>
        </TabsContent>

        <TabsContent value="delivery" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <Fact
              icon={Package}
              label="Minimum order"
              value={`${minOrder.toString()} ${listing.purchase_unit}`}
            />
            {listing.lead_time_days != null && (
              <Fact
                icon={Clock}
                label="Lead time"
                value={`${listing.lead_time_days} day${listing.lead_time_days === 1 ? '' : 's'}`}
              />
            )}
            {listing.min_order_note && (
              <Fact icon={Truck} label="Supplier note" value={listing.min_order_note} />
            )}
          </div>
          <BuyerProtectionNotice />
        </TabsContent>
      </Tabs>

      {messageOpen && (
        <MessageSupplierDialog
          supplierProfileId={listing.supplier_profile_id}
          supplierName={listing.supplier_name}
          listingId={listing.listing_id}
          listingTitle={listing.title}
          onClose={() => setMessageOpen(false)}
        />
      )}
    </div>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-text-secondary transition-colors hover:bg-tint-accent hover:text-tint-accent-foreground disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/**
 * A spec row sits directly on the PAGE, not inside a card — so it cannot use
 * `bg-background` as its recessed fill the way a well inside a white card
 * does. On the page that resolves to the same colour as its own backdrop and
 * the row disappears, leaving a label and a value floating a column apart.
 */
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-xl bg-card px-3.5 py-2.5 shadow-e1">
      <dt className="shrink-0 text-sm text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium text-text-primary">{value}</dd>
    </div>
  )
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-card p-3 shadow-e1">
      <IconBadge tone="accent" size="md">
        <Icon />
      </IconBadge>
      <div className="min-w-0">
        <p className="truncate text-xs text-text-muted">{label}</p>
        <p className="truncate text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  )
}

function tierLabel(min: string, max: string | null, unit: string): string {
  const from = new Decimal(min).toString()
  if (!max) return `${from}+ ${unit}`
  return `${from}–${new Decimal(max).toString()} ${unit}`
}

export type { ListingDetail }

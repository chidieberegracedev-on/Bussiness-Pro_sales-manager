import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  Package,
  Pencil,
  Plus,
  Trash2,
  ImagePlus,
  Loader2,
  Store,
  Inbox,
  Search,
  Tag,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { IconBadge, NotePanel } from '@/components/ui/icon-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MoneyInput } from '@/components/money/money-input'
import { Money } from '@/components/money/money'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useMySupplierProfile,
  useMyListings,
  useIncomingConnections,
  useUnreadMessageCount,
  useCreateListing,
  useUpdateListing,
  useDeleteListing,
  useAddPriceTier,
  useDeletePriceTier,
  useCanonicalSearch,
  useCreateCanonicalProduct,
  useListingImages,
  useAddListingImage,
  useDeleteListingImage,
  LISTING_STATUS_LABELS,
  type ListingWithTiers,
  type ListingPhoto,
  type CanonicalProduct,
} from '@/features/network/use-network'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { toUploadErrorMessage } from '@/lib/image-upload'
import type { ListingStatus } from '@/types/database'

const STATUSES: ListingStatus[] = ['active', 'out_of_stock', 'hidden']

/**
 * What this business sells on the network.
 *
 * A listing is an offer OF a canonical product — not a copy of the supplier's
 * own product record. That indirection is what lets a buyer compare four
 * suppliers of the same thing, and it is why every listing starts by choosing
 * from the shared catalog rather than typing a free-text name.
 *
 * Nothing here exposes the supplier's own cost, stock, or margin. A listing is
 * a price they chose to publish, and that is all it contains.
 */
export function MyListingsPage() {
  const { role } = useActiveBusiness()
  const { data: profile, isLoading: profileLoading } = useMySupplierProfile()
  const { data: listings, isLoading } = useMyListings()
  const { data: incoming } = useIncomingConnections()
  const unreadMessages = useUnreadMessageCount()
  const [addOpen, setAddOpen] = useState(false)

  const canManage = role === 'owner' || role === 'manager'

  if (profileLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  // A listing needs a storefront to hang off — supplier_profile_id is required.
  // Say that plainly instead of failing on insert.
  if (!profile) {
    return (
      <div>
        <PageHeader
          title="What you sell"
          description="Publish the products other businesses can buy from you."
        />
        <EmptyState
          icon={Store}
          title="Publish a storefront first"
          description="Products are listed under your storefront, so it has to exist before you can add any. It takes a minute and you're live straight away."
          action={
            <Button asChild>
              <Link to="/network/my-profile">
                <Store className="size-4" /> Set up my storefront
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  const active = (listings ?? []).filter((l) => l.availability === 'active')
  const inactive = (listings ?? []).filter((l) => l.availability !== 'active')
  const pendingRequests = (incoming ?? []).filter((c) => c.status === 'requested')

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Supplier Network"
        title="My listings"
        description={`Viewing the network as a seller: ${profile.display_name}`}
        actions={
          canManage ? (
            <>
              <Button variant="outline" asChild>
                <Link to="/network/my-profile">
                  <Store className="size-4" /> Storefront settings
                </Link>
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add listing
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Visibility, stated where a seller is actually working — the storefront
          page owns the switch, but someone editing listings needs to know
          whether anyone can see them. */}
      {!profile.is_public && (
        <NotePanel tone="warning" className="mb-5 flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 text-sm font-medium">
            Your storefront is hidden, so none of these listings are findable.
          </span>
          <Button variant="outline" size="sm" className="bg-surface" asChild>
            <Link to="/network/my-profile">Change visibility</Link>
          </Button>
        </NotePanel>
      )}

      {isLoading && <Skeleton className="h-48 w-full rounded-2xl" />}

      {!isLoading && (listings ?? []).length === 0 && (
        <EmptyState
          icon={Package}
          title="Nothing listed yet"
          description="Add the first product you want to sell. You can set a single price or wholesale breaks — cheaper the more they buy."
          action={
            canManage ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add listing
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && active.length > 0 && (
        <section className="mb-8">
          <h2 className="type-title mb-3">Active listings</h2>
          <div className="space-y-3">
            {active.map((listing) => (
              <ListingRow key={listing.id} listing={listing} canManage={canManage} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && inactive.length > 0 && (
        <section className="mb-8">
          <h2 className="type-title mb-1">Not for sale</h2>
          <p className="type-meta mb-3">
            Hidden or out of stock. Buyers can't find these.
          </p>
          <div className="space-y-3">
            {inactive.map((listing) => (
              <ListingRow key={listing.id} listing={listing} canManage={canManage} />
            ))}
          </div>
        </section>
      )}

      {/* Incoming interest — the seller's inbox, on the seller's screen. */}
      <section className="mb-8">
        <h2 className="type-title mb-1">Incoming requests</h2>
        <p className="type-meta mb-3">Businesses asking to buy from you.</p>

        {pendingRequests.length === 0 && unreadMessages === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-e2">
            <p className="type-body">
              Nothing waiting. Connection requests and buyer questions land here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.length > 0 && (
              <SellerAlert
                title={`${pendingRequests.length} connection request${pendingRequests.length === 1 ? '' : 's'}`}
                body="A business wants to buy from you. Accepting adds them to your Suppliers list on their side."
                to="/network/connections"
                cta="Review"
              />
            )}
            {unreadMessages > 0 && (
              <SellerAlert
                title={`${unreadMessages} unanswered message${unreadMessages === 1 ? '' : 's'}`}
                body="Response time is one of the trust facts buyers see on your storefront."
                to="/network/messages"
                cta="Reply"
              />
            )}
          </div>
        )}
      </section>

      {addOpen && <AddListingDialog onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function SellerAlert({
  title,
  body,
  to,
  cta,
}: {
  title: string
  body: string
  to: string
  cta: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4 shadow-e2">
      <IconBadge tone="accent" size="lg">
        <Inbox />
      </IconBadge>
      <div className="min-w-0 flex-1">
        <p className="type-heading">{title}</p>
        <p className="type-meta mt-0.5">{body}</p>
      </div>
      <Button variant="outline" asChild className="shrink-0">
        <Link to={to}>{cta}</Link>
      </Button>
    </div>
  )
}

function ListingRow({
  listing,
  canManage,
}: {
  listing: ListingWithTiers
  canManage: boolean
}) {
  const update = useUpdateListing()
  const remove = useDeleteListing()
  const addTier = useAddPriceTier()
  const removeTier = useDeletePriceTier()
  const { data: photos } = useListingImages(listing.id)

  const [minQty, setMinQty] = useState('')
  const [maxQty, setMaxQty] = useState('')
  const [price, setPrice] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function submitTier(e: FormEvent) {
    e.preventDefault()
    if (!price.trim()) return
    try {
      await addTier.mutateAsync({
        listingId: listing.id,
        minQty: minQty.trim() || '1',
        maxQty: maxQty.trim() || null,
        unitPrice: price.trim(),
      })
      setMinQty('')
      setMaxQty('')
      setPrice('')
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't add that price",
        description: toReadableError(error),
      })
    }
  }

  const cover = (photos ?? [])[0]?.url ?? listing.product?.image_url ?? undefined

  return (
    <Card elevation="raised" className="rounded-2xl">
      <CardContent className="pt-6">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/60">
            {cover ? (
              <img src={cover} alt="" className="size-full object-cover" />
            ) : (
              <Package className="size-5 text-tint-accent-foreground/60" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <Link
              to={`/network/listings/${listing.id}`}
              className="block truncate text-sm font-semibold text-text-primary hover:underline"
            >
              {listing.supplier_product_name ?? listing.product?.name ?? 'Product'}
            </Link>
            <p className="truncate text-xs text-text-muted">
              {/* Only worth showing when the supplier gave it a different name
                  — otherwise it just repeats the heading. */}
              {listing.supplier_product_name &&
              listing.product?.name &&
              listing.supplier_product_name !== listing.product.name
                ? `Catalog: ${listing.product.name} · `
                : ''}
              sold per {listing.purchase_unit}
              {Number(listing.conversion_to_base) !== 1 &&
                ` · 1 ${listing.purchase_unit} = ${new Decimal(listing.conversion_to_base).toString()} ${listing.product?.base_unit ?? 'unit'}`}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Minimum order {new Decimal(listing.min_order_qty).toString()} {listing.purchase_unit}
            </p>
          </div>

          {canManage && (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
                <Pencil className="size-3.5" /> Details
              </Button>
              <Select
                value={listing.availability}
                onValueChange={(v) =>
                  update.mutate({ id: listing.id, availability: v as ListingStatus })
                }
              >
                <SelectTrigger className="w-36" aria-label={`Availability of ${listing.product?.name ?? 'listing'}`}>
                  <SelectValue>{LISTING_STATUS_LABELS[listing.availability]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LISTING_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove listing"
                onClick={() => {
                  if (confirm('Remove this listing from the network?')) remove.mutate(listing.id)
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Photos. Not the catalog picture — the supplier's own, of the goods
            they will actually send. A buyer deciding between four suppliers of
            the same catalog entry has nothing else to look at. */}
        {canManage && <PhotoStrip listing={listing} photos={photos ?? []} />}

        {/* Price breaks. The whole point of wholesale — one flat price hides
            the decision the buyer is actually making. */}
        <div className="mt-4 rounded-lg border border-border">
          <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Price per {listing.purchase_unit}
          </p>

          {listing.tiers.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-text-secondary">
              No price published yet — buyers will see "price on request".
            </p>
          )}

          <ul className="divide-y divide-border">
            {listing.tiers.map((tier) => (
              <li key={tier.id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm">
                <Tag className="size-3.5 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {new Decimal(tier.min_qty).toString()}
                  {tier.max_qty ? `–${new Decimal(tier.max_qty).toString()}` : '+'}{' '}
                  {listing.purchase_unit}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-accent-primary">
                  <Money value={tier.unit_price} />
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => removeTier.mutate(tier.id)}
                    aria-label="Remove this price"
                    className="shrink-0 rounded-md p-1 text-text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canManage && (
            <form onSubmit={submitTier} className="flex flex-wrap items-end gap-2 border-t border-border p-3">
              <div>
                <label className="text-xs text-text-muted">From qty</label>
                <Input
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="1"
                  inputMode="decimal"
                  className="mt-1 h-9 w-24"
                  aria-label="Minimum quantity for this price"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted">To qty</label>
                <Input
                  value={maxQty}
                  onChange={(e) => setMaxQty(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="and above"
                  inputMode="decimal"
                  className="mt-1 h-9 w-28"
                  aria-label="Maximum quantity for this price"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted">Price each</label>
                <MoneyInput
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 h-9 w-32"
                  aria-label="Price per purchase unit"
                />
              </div>
              <Button type="submit" size="sm" disabled={!price.trim() || addTier.isPending}>
                {addTier.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Add price
              </Button>
            </form>
          )}
        </div>
      </CardContent>

      {detailsOpen && (
        <ListingDetailsDialog listing={listing} onClose={() => setDetailsOpen(false)} />
      )}
    </Card>
  )
}

/**
 * The photo row.
 *
 * Uploads go to the PUBLIC network-images bucket — a marketplace photo is read
 * by businesses that are not members of this one, so it cannot be a signed URL
 * from a private bucket. That also means these images are readable by anyone
 * holding the link, which is why the caption says so rather than leaving a
 * supplier to discover it.
 */
function PhotoStrip({
  listing,
  photos,
}: {
  listing: ListingWithTiers
  photos: ListingPhoto[]
}) {
  const add = useAddListingImage()
  const remove = useDeleteListingImage()

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately, or picking the same file twice in a row is a no-op.
    event.target.value = ''
    if (!file) return
    add.mutate(
      { listingId: listing.id, file, sortOrder: photos.length },
      {
        onError: (error) =>
          toast({
            variant: 'destructive',
            title: "Couldn't upload that photo",
            description: toUploadErrorMessage(error),
          }),
      },
    )
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Photos</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative">
            <img
              src={photo.url}
              alt=""
              className="size-20 rounded-xl object-cover shadow-e1"
              loading="lazy"
            />
            <button
              type="button"
              onClick={() => remove.mutate(photo)}
              aria-label="Remove this photo"
              className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-surface text-text-muted shadow-e2 transition-colors hover:bg-danger hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        <label
          className={`flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-tint-accent text-xs font-medium text-tint-accent-foreground transition-opacity ${
            add.isPending ? 'opacity-60' : 'hover:opacity-85'
          }`}
        >
          {add.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
          {add.isPending ? 'Uploading' : 'Add photo'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onPick}
            disabled={add.isPending}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        Published to the network — anyone with the link can see these, including after you hide the
        listing. The first photo is the one buyers see on cards.
      </p>
    </div>
  )
}

/** Description, packing and lead time — the questions a buyer asks anyway. */
function ListingDetailsDialog({
  listing,
  onClose,
}: {
  listing: ListingWithTiers
  onClose: () => void
}) {
  const update = useUpdateListing()
  const [description, setDescription] = useState(listing.description ?? '')
  const [pack, setPack] = useState(listing.pack_description ?? '')
  const [leadTime, setLeadTime] = useState(
    listing.lead_time_days == null ? '' : String(listing.lead_time_days),
  )

  function save() {
    update.mutate(
      {
        id: listing.id,
        description: description.trim() || null,
        pack_description: pack.trim() || null,
        lead_time_days: leadTime.trim() ? Number(leadTime) : null,
      },
      {
        onSuccess: () => {
          toast({ title: 'Listing updated' })
          onClose()
        },
        onError: (error) =>
          toast({
            variant: 'destructive',
            title: "Couldn't save that",
            description: toReadableError(error),
          }),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {listing.supplier_product_name ?? listing.product?.name ?? 'Listing'} details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-secondary">Description</label>
            <Textarea
              className="mt-1"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it is, what condition, anything a buyer should know before ordering."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-text-secondary">Packing</label>
              <Input
                className="mt-1"
                value={pack}
                onChange={(e) => setPack(e.target.value)}
                placeholder={`e.g. sealed ${listing.purchase_unit}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Lead time (days)</label>
              <Input
                className="mt-1"
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="2"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Listing starts from the shared catalog, not a free-text name. Without that,
 * "Rice 50kg" and "50kg Rice" become two products and the comparison the
 * marketplace exists for stops working.
 */
function AddListingDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateListing()
  const createCanonical = useCreateCanonicalProduct()

  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const { data: results, isFetching } = useCanonicalSearch(debounced)
  const [chosen, setChosen] = useState<CanonicalProduct | null>(null)

  const [supplierName, setSupplierName] = useState('')
  const [purchaseUnit, setPurchaseUnit] = useState('carton')
  const [conversion, setConversion] = useState('1')
  const [moq, setMoq] = useState('1')

  async function createAndChoose() {
    try {
      const created = await createCanonical.mutateAsync({ name: search.trim() })
      setChosen(created)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't add that to the catalog",
        description: toReadableError(error),
      })
    }
  }

  async function submit() {
    if (!chosen) return
    try {
      await create.mutateAsync({
        canonicalProductId: chosen.id,
        supplierProductName: supplierName || null,
        purchaseUnit,
        conversionToBase: conversion || '1',
        minOrderQty: moq || '1',
      })
      toast({
        title: 'Listed',
        description: 'Add a price so buyers see more than "price on request".',
      })
      onClose()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't list that product",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>List a product</DialogTitle>
        </DialogHeader>

        {!chosen ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Find what you're selling in the shared catalog. Listing against the same catalog entry
              as other suppliers is what lets buyers compare you side by side.
            </p>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the catalog"
                className="pl-9"
                autoFocus
                aria-label="Search the shared catalog"
              />
            </div>

            {isFetching && <Loader2 className="size-4 animate-spin text-text-muted" />}

            {(results ?? []).length > 0 && (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {(results ?? []).map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(row)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted"
                    >
                      <Package className="size-4 shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-primary">{row.name}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {row.brand ?? row.category ?? row.gtin ?? '—'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {debounced.trim().length >= 2 && !isFetching && (results ?? []).length === 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3">
                <p className="min-w-0 text-sm text-text-secondary">
                  Nothing matches "{debounced.trim()}".
                </p>
                <Button size="sm" variant="outline" onClick={createAndChoose} disabled={createCanonical.isPending}>
                  {createCanonical.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Add it to the catalog
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/50 p-2.5">
              <Package className="size-4 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {chosen.name}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
                Change
              </Button>
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary">Your name for it</label>
              <Input
                className="mt-1"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder={chosen.name}
              />
              <p className="mt-1 text-xs text-text-muted">
                Optional. Leave blank to use the catalog name.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-text-secondary">You sell it by the</label>
                <Input
                  className="mt-1"
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                  placeholder="carton"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary">
                  How many {chosen.base_unit} in one
                </label>
                <Input
                  className="mt-1"
                  value={conversion}
                  onChange={(e) => setConversion(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                />
              </div>
            </div>
            <p className="text-xs text-text-muted">
              This is what lets a buyer's system convert your pack into their own units — the same
              rule their receiving uses.
            </p>

            <div>
              <label className="text-sm font-medium text-text-secondary">
                Minimum order ({purchaseUnit || 'unit'})
              </label>
              <Input
                className="mt-1"
                value={moq}
                onChange={(e) => setMoq(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={create.isPending}>
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                List it
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

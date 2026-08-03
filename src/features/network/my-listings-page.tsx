import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  Package,
  Plus,
  Trash2,
  Loader2,
  Store,
  Search,
  Tag,
  Info,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  useCreateListing,
  useUpdateListing,
  useDeleteListing,
  useAddPriceTier,
  useDeletePriceTier,
  useCanonicalSearch,
  useCreateCanonicalProduct,
  LISTING_STATUS_LABELS,
  type ListingWithTiers,
  type CanonicalProduct,
} from '@/features/network/use-network'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
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

  return (
    <div>
      <PageHeader
        title="What you sell"
        description="The products other businesses can buy from you, and what you charge at each quantity."
        actions={
          canManage ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> List a product
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/5 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-sm text-text-secondary">
          Buyers see the product, your price breaks, and your minimum order — nothing about what you
          paid, what you hold, or who else buys from you.
        </p>
      </div>

      {isLoading && <Skeleton className="h-48 w-full rounded-xl" />}

      {!isLoading && (listings ?? []).length === 0 && (
        <EmptyState
          icon={Package}
          title="Nothing listed yet"
          description="Add the first product you want to sell. You can set a single price or wholesale breaks — cheaper the more they buy."
          action={
            canManage ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> List a product
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && (listings ?? []).length > 0 && (
        <div className="space-y-3">
          {(listings ?? []).map((listing) => (
            <ListingRow key={listing.id} listing={listing} canManage={canManage} />
          ))}
        </div>
      )}

      {addOpen && <AddListingDialog onClose={() => setAddOpen(false)} />}
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

  const [minQty, setMinQty] = useState('')
  const [maxQty, setMaxQty] = useState('')
  const [price, setPrice] = useState('')

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

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
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
    </Card>
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

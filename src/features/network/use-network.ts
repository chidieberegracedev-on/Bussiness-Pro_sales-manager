import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { networkImageUrl, uploadBusinessScopedImage } from '@/lib/image-upload'
import { NETWORK_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useActiveBusiness } from '@/features/business/hooks'
import type {
  ConnectStatus,
  Database,
  ListingStatus,
  SupplierVerification,
} from '@/types/database'

export type SupplierProfile = Database['public']['Tables']['supplier_profiles']['Row']
export type SupplierListing = Database['public']['Tables']['supplier_listings']['Row']
export type PriceTier = Database['public']['Tables']['listing_price_tiers']['Row']
export type SupplierConnection = Database['public']['Tables']['supplier_connections']['Row']
export type CanonicalProduct = Database['public']['Tables']['canonical_products']['Row']
export type MarketplaceRow = Database['public']['Views']['v_marketplace_listings']['Row']

/**
 * The PUBLIC plane.
 *
 * Everything in this file reads cross-business data on purpose. The safety
 * rule is structural rather than conditional: these are separate tables whose
 * RLS permits reading a supplier's own published rows and nothing else. No
 * query here touches a private table, so there is no code path — correct or
 * buggy — by which one business's cost, margin, purchase history, or inventory
 * can appear in another's marketplace.
 *
 * Read that as a constraint on future edits too: if a marketplace screen needs
 * a number, it comes from the public plane or it doesn't get shown.
 */

/**
 * One canonical product with the suppliers offering it.
 *
 * The view returns a row per LISTING; the marketplace shows a row per PRODUCT.
 * Grouping here rather than in SQL keeps the view a plain projection and means
 * one product sold by four suppliers is one card with four offers, not four
 * of the same thing — the entire reason the canonical catalog exists.
 */
export interface MarketplaceProduct {
  canonicalProductId: string
  productName: string
  brand: string | null
  category: string | null
  imageUrl: string | null
  suppliers: MarketplaceRow[]
  /** Cheapest price across every supplier offering it. */
  fromPrice: Decimal | null
  currencyCode: string | null
  supplierCount: number
}

export interface MarketplaceFilters {
  search?: string
  category?: string | 'all'
  /** Hide listings whose supplier has none of the trust indicators filled in. */
  verifiedOnly?: boolean
  inStockOnly?: boolean
  canonicalProductId?: string
}

export function useMarketplace(filters: MarketplaceFilters = {}) {
  const { business } = useActiveBusiness()

  const query = useQuery({
    queryKey: ['marketplace', business?.id, filters],
    queryFn: async () => {
      let q = supabase.from('v_marketplace_listings').select('*').limit(400)

      if (filters.canonicalProductId) {
        q = q.eq('canonical_product_id', filters.canonicalProductId)
      }
      if (filters.category && filters.category !== 'all') {
        q = q.eq('category', filters.category)
      }
      if (filters.inStockOnly) {
        q = q.eq('availability', 'active')
      }
      if (filters.search?.trim()) {
        const term = filters.search.trim()
        q = q.or(`product_name.ilike.%${term}%,brand.ilike.%${term}%,supplier_name.ilike.%${term}%`)
      }

      const { data, error } = await q
      if (error) {
        console.error('[v_marketplace_listings] failed', { filters, error })
        throw error
      }
      return (data ?? []) as MarketplaceRow[]
    },
    enabled: !!business,
  })

  const products = useMemo(() => {
    const byProduct = new Map<string, MarketplaceProduct>()
    for (const row of query.data ?? []) {
      let entry = byProduct.get(row.canonical_product_id)
      if (!entry) {
        entry = {
          canonicalProductId: row.canonical_product_id,
          productName: row.product_name,
          brand: row.brand,
          category: row.category,
          imageUrl: row.image_url,
          suppliers: [],
          fromPrice: null,
          currencyCode: row.currency_code,
          supplierCount: 0,
        }
        byProduct.set(row.canonical_product_id, entry)
      }
      entry.suppliers.push(row)
      if (row.from_price !== null) {
        const price = new Decimal(row.from_price)
        if (!entry.fromPrice || price.lt(entry.fromPrice)) entry.fromPrice = price
      }
    }

    for (const entry of byProduct.values()) {
      entry.supplierCount = entry.suppliers.length
      // Cheapest offer first — the comparison is the point of the screen.
      entry.suppliers.sort((a, b) => {
        if (a.from_price === null) return 1
        if (b.from_price === null) return -1
        return new Decimal(a.from_price).comparedTo(new Decimal(b.from_price))
      })
    }

    return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName))
  }, [query.data])

  return { ...query, products }
}

export function useMarketplaceCategories() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['marketplace-categories', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_marketplace_listings')
        .select('category')
        .limit(500)
      if (error) throw error
      const set = new Set<string>()
      for (const row of (data ?? []) as { category: string | null }[]) {
        if (row.category) set.add(row.category)
      }
      return [...set].sort()
    },
    enabled: !!business,
  })
}

/** A public supplier storefront, with its listings and price breaks. */
export function useSupplierProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: ['supplier-profile', profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_profiles')
        .select('*')
        .eq('id', profileId!)
        .single()
      if (error) {
        console.error('[supplier_profiles] failed', { profileId, error })
        throw error
      }
      return data as SupplierProfile
    },
    enabled: !!profileId,
  })
}

export interface ListingWithTiers extends SupplierListing {
  product: Pick<CanonicalProduct, 'id' | 'name' | 'brand' | 'category' | 'image_url' | 'base_unit'> | null
  tiers: PriceTier[]
}

export function useSupplierListings(profileId: string | undefined) {
  return useQuery({
    queryKey: ['supplier-listings', profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_listings')
        .select(
          '*, canonical_products(id, name, brand, category, image_url, base_unit), listing_price_tiers(*)',
        )
        .eq('supplier_profile_id', profileId!)
        .order('created_at', { ascending: true })
      if (error) {
        console.error('[supplier_listings] failed', { profileId, error })
        throw error
      }
      type Raw = SupplierListing & {
        canonical_products: ListingWithTiers['product']
        listing_price_tiers: PriceTier[] | null
      }
      return ((data ?? []) as unknown as Raw[]).map(
        (row): ListingWithTiers => ({
          ...row,
          product: row.canonical_products,
          tiers: [...(row.listing_price_tiers ?? [])].sort(
            (a, b) => new Decimal(a.min_qty).comparedTo(new Decimal(b.min_qty)),
          ),
        }),
      )
    },
    enabled: !!profileId,
  })
}

/** This business's own public profile, if it has opted in at all. */
export function useMySupplierProfile() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['my-supplier-profile', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_profiles')
        .select('*')
        .eq('business_id', business!.id)
        .maybeSingle()
      if (error) {
        console.error('[my supplier_profiles] failed', error)
        throw error
      }
      return (data ?? null) as SupplierProfile | null
    },
    enabled: !!business,
  })
}

export function usePublishSupplierProfile() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      displayName: string
      description?: string | null
      locationText?: string | null
    }) => {
      const { data, error } = await supabase.rpc('publish_supplier_profile', {
        p_business_id: business!.id,
        p_display_name: input.displayName,
        p_description: input.description ?? null,
        p_location_text: input.locationText ?? null,
      })
      if (error) {
        console.error('[publish_supplier_profile] failed', { input, error })
        throw error
      }
      return data as unknown as SupplierProfile
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-supplier-profile', business?.id] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

/** Contact details and the rest of the storefront, edited directly. */
export function useUpdateSupplierProfile() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<SupplierProfile> & { id: string }) => {
      const { id, ...rest } = patch
      const { error } = await supabase.from('supplier_profiles').update(rest).eq('id', id)
      if (error) {
        console.error('[supplier_profiles.update] failed', { patch, error })
        throw error
      }
    },
    onSuccess: (_d, patch) => {
      qc.invalidateQueries({ queryKey: ['my-supplier-profile', business?.id] })
      qc.invalidateQueries({ queryKey: ['supplier-profile', patch.id] })
    },
  })
}

// ---------------------------------------------------------------------------
// The connect bridge — the only place the public plane touches the private one
// ---------------------------------------------------------------------------

export interface ConnectionRow extends SupplierConnection {
  profile: Pick<SupplierProfile, 'id' | 'display_name' | 'location_text' | 'verification'> | null
}

/** Requests this business has sent out. */
export function useOutgoingConnections() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['connections-out', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_connections')
        .select('*, supplier_profiles(id, display_name, location_text, verification)')
        .eq('requester_business_id', business!.id)
        .order('requested_at', { ascending: false })
      if (error) {
        console.error('[connections out] failed', error)
        throw error
      }
      type Raw = SupplierConnection & { supplier_profiles: ConnectionRow['profile'] }
      return ((data ?? []) as unknown as Raw[]).map(
        (r): ConnectionRow => ({ ...r, profile: r.supplier_profiles }),
      )
    },
    enabled: !!business,
  })
}

/**
 * Requests arriving at this business's own supplier profile.
 *
 * Scoped by profile id rather than by "not mine": the RLS policy lets a
 * business see connections on either side, so filtering by the wrong thing
 * here would show it its own outgoing requests as if they were incoming.
 */
export function useIncomingConnections() {
  const { business } = useActiveBusiness()
  const { data: profile } = useMySupplierProfile()

  return useQuery({
    queryKey: ['connections-in', business?.id, profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_connections')
        .select('*')
        .eq('supplier_profile_id', profile!.id)
        .order('requested_at', { ascending: false })
      if (error) {
        console.error('[connections in] failed', error)
        throw error
      }
      return (data ?? []) as SupplierConnection[]
    },
    enabled: !!business && !!profile?.id,
  })
}

function useConnectionMutation<TArgs>(
  fn: (args: TArgs) => Promise<void>,
  label: string,
) {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections-out', business?.id] })
      qc.invalidateQueries({ queryKey: ['connections-in', business?.id] })
      // Accepting mints a PRIVATE supplier — the Phase 5 list must refresh.
      qc.invalidateQueries({ queryKey: ['suppliers', business?.id] })
    },
    meta: { label },
  })
}

export function useRequestConnection() {
  const { business } = useActiveBusiness()
  return useConnectionMutation(async (supplierProfileId: string) => {
    const { error } = await supabase.rpc('request_supplier_connection', {
      p_business_id: business!.id,
      p_supplier_profile_id: supplierProfileId,
    })
    if (error) {
      console.error('[request_supplier_connection] failed', { supplierProfileId, error })
      throw error
    }
  }, 'request')
}

export function useAcceptConnection() {
  return useConnectionMutation(async (connectionId: string) => {
    const { error } = await supabase.rpc('accept_supplier_connection', {
      p_connection_id: connectionId,
    })
    if (error) {
      console.error('[accept_supplier_connection] failed', { connectionId, error })
      throw error
    }
  }, 'accept')
}

export function useDeclineConnection() {
  return useConnectionMutation(async (connectionId: string) => {
    const { error } = await supabase.rpc('decline_supplier_connection', {
      p_connection_id: connectionId,
    })
    if (error) {
      console.error('[decline_supplier_connection] failed', { connectionId, error })
      throw error
    }
  }, 'decline')
}

export function useRevokeConnection() {
  return useConnectionMutation(async (connectionId: string) => {
    const { error } = await supabase.rpc('revoke_supplier_connection', {
      p_connection_id: connectionId,
    })
    if (error) {
      console.error('[revoke_supplier_connection] failed', { connectionId, error })
      throw error
    }
  }, 'revoke')
}

/** Connection state per supplier profile, for rendering the Connect button. */
export function useConnectionStatusMap() {
  const { data: outgoing } = useOutgoingConnections()

  return useMemo(() => {
    const map = new Map<string, { status: ConnectStatus; connectionId: string }>()
    for (const row of outgoing ?? []) {
      map.set(row.supplier_profile_id, { status: row.status, connectionId: row.id })
    }
    return map
  }, [outgoing])
}

// ---------------------------------------------------------------------------
// Canonical catalog
// ---------------------------------------------------------------------------

export function useCanonicalSearch(term: string) {
  return useQuery({
    queryKey: ['canonical-search', term],
    queryFn: async () => {
      let q = supabase
        .from('canonical_products')
        .select('*')
        .eq('is_active', true)
        .limit(20)
      if (term.trim()) q = q.ilike('name', `%${term.trim()}%`)
      const { data, error } = await q
      if (error) {
        console.error('[canonical_products search] failed', { term, error })
        throw error
      }
      return (data ?? []) as CanonicalProduct[]
    },
    enabled: term.trim().length >= 2,
  })
}

/** Barcode first, name second — GTIN is the spine of catalog identity. */
export function useCanonicalByGtin(gtin: string | null | undefined) {
  return useQuery({
    queryKey: ['canonical-gtin', gtin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canonical_products')
        .select('*')
        .eq('gtin', gtin!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as CanonicalProduct | null
    },
    enabled: !!gtin,
  })
}

export function useLinkVariantToCanonical() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { variantId: string; canonicalProductId: string | null }) => {
      const { error } = await supabase
        .from('product_variants')
        .update({ canonical_product_id: input.canonicalProductId })
        .eq('id', input.variantId)
      if (error) {
        console.error('[link canonical] failed', { input, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product'] })
      qc.invalidateQueries({ queryKey: ['variant-canonical'] })
    },
  })
}

export function useCreateCanonicalProduct() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      brand?: string | null
      category?: string | null
      gtin?: string | null
      baseUnit?: string
    }) => {
      const { data, error } = await supabase
        .from('canonical_products')
        .insert({
          name: input.name.trim(),
          brand: input.brand?.trim() || null,
          category: input.category?.trim() || null,
          gtin: input.gtin?.trim() || null,
          base_unit: input.baseUnit || 'unit',
          created_by_business: business!.id,
        })
        .select()
        .single()
      if (error) {
        console.error('[canonical_products.insert] failed', { input, error })
        throw error
      }
      return data as CanonicalProduct
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canonical-search'] }),
  })
}

/** Which canonical product a variant is linked to, if any. */
export function useVariantCanonical(variantId: string | undefined) {
  return useQuery({
    queryKey: ['variant-canonical', variantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('canonical_product_id, canonical_products(*)')
        .eq('id', variantId!)
        .single()
      if (error) throw error
      const row = data as unknown as {
        canonical_product_id: string | null
        canonical_products: CanonicalProduct | null
      }
      return row.canonical_products
    },
    enabled: !!variantId,
  })
}

export const VERIFICATION_LABELS: Record<SupplierVerification, string> = {
  unverified: 'Not verified',
  pending: 'Verification pending',
  verified: 'Verified',
  rejected: 'Verification rejected',
}

export const CONNECT_LABELS: Record<ConnectStatus, string> = {
  requested: 'Request sent',
  accepted: 'Connected',
  declined: 'Declined',
  revoked: 'Disconnected',
}

// ---------------------------------------------------------------------------
// Listing management — the supplier's side of the marketplace
//
// Writes go straight to the tables rather than through an RPC: 0024 gives
// supplier_listings and listing_price_tiers owner-restricted write policies,
// so RLS is the enforcement and there is nothing extra for a function to
// check. Every write carries business_id because both policies key off it.
// ---------------------------------------------------------------------------

export function useMyListings() {
  const { data: profile } = useMySupplierProfile()
  return useSupplierListings(profile?.id)
}

export function useCreateListing() {
  const { business } = useActiveBusiness()
  const { data: profile } = useMySupplierProfile()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      canonicalProductId: string
      supplierProductName?: string | null
      purchaseUnit: string
      conversionToBase: string
      minOrderQty: string
      availability?: ListingStatus
    }) => {
      if (!profile) throw new Error('Publish your storefront before listing products.')
      const { data, error } = await supabase
        .from('supplier_listings')
        .insert({
          supplier_profile_id: profile.id,
          business_id: business!.id,
          canonical_product_id: input.canonicalProductId,
          supplier_product_name: input.supplierProductName?.trim() || null,
          purchase_unit: input.purchaseUnit.trim() || 'unit',
          conversion_to_base: input.conversionToBase || '1',
          min_order_qty: input.minOrderQty || '1',
          availability: input.availability ?? 'active',
          // The supplier quotes in their own currency, not the buyer's.
          currency_code: business!.currency_code,
        })
        .select()
        .single()
      if (error) {
        console.error('[supplier_listings.insert] failed', { input, error })
        throw error
      }
      return data as SupplierListing
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-listings'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export function useUpdateListing() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<SupplierListing> & { id: string }) => {
      const { id, ...rest } = patch
      const { error } = await supabase.from('supplier_listings').update(rest).eq('id', id)
      if (error) {
        console.error('[supplier_listings.update] failed', { patch, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-listings'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export function useDeleteListing() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_listings').delete().eq('id', id)
      if (error) {
        console.error('[supplier_listings.delete] failed', { id, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-listings'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

/**
 * A price break. Inserting one also records it in listing_price_history via
 * the 0025 trigger, which is what a price trend is later derived from.
 */
export function useAddPriceTier() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      listingId: string
      minQty: string
      maxQty?: string | null
      unitPrice: string
    }) => {
      const { error } = await supabase.from('listing_price_tiers').insert({
        listing_id: input.listingId,
        business_id: business!.id,
        min_qty: input.minQty || '1',
        max_qty: input.maxQty?.trim() ? input.maxQty : null,
        unit_price: input.unitPrice,
      })
      if (error) {
        console.error('[listing_price_tiers.insert] failed', { input, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-listings'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export function useDeletePriceTier() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('listing_price_tiers').delete().eq('id', id)
      if (error) {
        console.error('[listing_price_tiers.delete] failed', { id, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-listings'] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: 'For sale',
  out_of_stock: 'Out of stock',
  hidden: 'Hidden',
}

// ---------------------------------------------------------------------------
// Listing photos (0028)
//
// These live in the PUBLIC network-images bucket, so a URL is built with
// networkImageUrl() rather than signed. A signed URL is scoped by membership,
// and the whole point of a marketplace photo is that a non-member sees it —
// signing here would fail silently as a broken image on every screen but the
// owner's own.
// ---------------------------------------------------------------------------

export type ListingImage = Database['public']['Tables']['supplier_listing_images']['Row']

export interface ListingPhoto extends ListingImage {
  /** Ready to drop into an <img src>. Undefined only if the path is empty. */
  url: string | undefined
}

export function useListingImages(listingId: string | undefined) {
  return useQuery({
    queryKey: ['listing-images', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_listing_images')
        .select('*')
        .eq('listing_id', listingId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        console.error('[supplier_listing_images] failed', { listingId, error })
        throw error
      }
      return ((data ?? []) as ListingImage[]).map(
        (row): ListingPhoto => ({ ...row, url: networkImageUrl(row.storage_path) }),
      )
    },
    enabled: !!listingId,
  })
}

/** Photos for many listings at once, so a grid doesn't fire a query per card. */
export function useListingImageMap(listingIds: string[]) {
  const key = [...listingIds].sort().join(',')

  return useQuery({
    queryKey: ['listing-image-map', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_listing_images')
        .select('*')
        .in('listing_id', listingIds)
        .order('sort_order', { ascending: true })
      if (error) {
        console.error('[listing image map] failed', error)
        throw error
      }
      // First photo per listing — the one a card shows.
      const map = new Map<string, string>()
      for (const row of (data ?? []) as ListingImage[]) {
        if (map.has(row.listing_id)) continue
        const url = networkImageUrl(row.storage_path)
        if (url) map.set(row.listing_id, url)
      }
      return map
    },
    enabled: listingIds.length > 0,
  })
}

export function useAddListingImage() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { listingId: string; file: File; sortOrder?: number }) => {
      const path = await uploadBusinessScopedImage(
        NETWORK_IMAGE_BUCKET,
        business!.id,
        input.file,
        { kind: 'network-listing', listingId: input.listingId },
      )
      const { data, error } = await supabase
        .from('supplier_listing_images')
        .insert({
          listing_id: input.listingId,
          business_id: business!.id,
          storage_path: path,
          sort_order: input.sortOrder ?? 0,
        })
        .select()
        .single()
      if (error) {
        console.error('[supplier_listing_images.insert] failed', { input: input.listingId, error })
        throw error
      }
      return data as ListingImage
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['listing-images', input.listingId] })
      qc.invalidateQueries({ queryKey: ['listing-image-map'] })
    },
  })
}

export function useDeleteListingImage() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (image: ListingImage) => {
      const { error } = await supabase
        .from('supplier_listing_images')
        .delete()
        .eq('id', image.id)
      if (error) {
        console.error('[supplier_listing_images.delete] failed', { id: image.id, error })
        throw error
      }
      // The row is the record; a leftover object in the bucket is wasted bytes
      // rather than a visible bug, so a failure here is logged, not thrown.
      const { error: storageError } = await supabase.storage
        .from(NETWORK_IMAGE_BUCKET)
        .remove([image.storage_path])
      if (storageError) {
        console.error('[network-images.remove] failed', { path: image.storage_path, storageError })
      }
    },
    onSuccess: (_d, image) => {
      qc.invalidateQueries({ queryKey: ['listing-images', image.listing_id] })
      qc.invalidateQueries({ queryKey: ['listing-image-map'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Listing detail (0028)
// ---------------------------------------------------------------------------

export type ListingDetail = Database['public']['Views']['v_listing_detail']['Row']

export function useListingDetail(listingId: string | undefined) {
  return useQuery({
    queryKey: ['listing-detail', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_listing_detail')
        .select('*')
        .eq('listing_id', listingId!)
        .maybeSingle()
      if (error) {
        console.error('[v_listing_detail] failed', { listingId, error })
        throw error
      }
      return (data ?? null) as ListingDetail | null
    },
    enabled: !!listingId,
  })
}

export function useListingTiers(listingId: string | undefined) {
  return useQuery({
    queryKey: ['listing-tiers', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listing_price_tiers')
        .select('*')
        .eq('listing_id', listingId!)
      if (error) {
        console.error('[listing_price_tiers] failed', { listingId, error })
        throw error
      }
      return ((data ?? []) as PriceTier[]).sort((a, b) =>
        new Decimal(a.min_qty).comparedTo(new Decimal(b.min_qty)),
      )
    },
    enabled: !!listingId,
  })
}

/**
 * The price a quantity actually lands on.
 *
 * Wholesale tiers are the reason a buyer is looking, and "from 4.20" is not
 * the number they will pay. Picking the tier here means the detail page can
 * show the real unit price and the real line total as the stepper moves.
 */
export function tierForQuantity(tiers: PriceTier[], qty: Decimal): PriceTier | null {
  let best: PriceTier | null = null
  for (const tier of tiers) {
    const min = new Decimal(tier.min_qty)
    if (qty.lt(min)) continue
    if (tier.max_qty !== null && qty.gt(new Decimal(tier.max_qty))) continue
    // Tiers are sorted ascending, so the last match is the deepest break.
    best = tier
  }
  return best
}

// ---------------------------------------------------------------------------
// Messaging (0028)
//
// Every write is an RPC. The client never inserts a thread or a message
// directly — the server is what resolves which side the caller is on, and
// snapshots the display names onto the thread.
// ---------------------------------------------------------------------------

export type NetworkThread = Database['public']['Views']['v_network_threads']['Row']
export type NetworkMessage = Database['public']['Tables']['network_messages']['Row']

export function useNetworkThreads() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['network-threads', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_network_threads')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false })
      if (error) {
        console.error('[v_network_threads] failed', error)
        throw error
      }
      return (data ?? []) as NetworkThread[]
    },
    enabled: !!business,
    // A conversation is live: someone is waiting on the other end.
    refetchInterval: 30_000,
  })
}

export function useUnreadMessageCount(): number {
  const { data } = useNetworkThreads()
  return (data ?? []).reduce((sum, t) => sum + (t.unread_count ?? 0), 0)
}

export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ['network-messages', threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('network_messages')
        .select('*')
        .eq('thread_id', threadId!)
        .order('created_at', { ascending: true })
      if (error) {
        console.error('[network_messages] failed', { threadId, error })
        throw error
      }
      return (data ?? []) as NetworkMessage[]
    },
    enabled: !!threadId,
    refetchInterval: 15_000,
  })
}

/** The thread with a given supplier, if one already exists. */
export function useThreadWithSupplier(supplierProfileId: string | undefined) {
  const { data: threads } = useNetworkThreads()
  return useMemo(
    () =>
      (threads ?? []).find(
        (t) => t.supplier_profile_id === supplierProfileId && t.i_am_buyer,
      ) ?? null,
    [threads, supplierProfileId],
  )
}

export function useStartThread() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      supplierProfileId: string
      body: string
      listingId?: string | null
    }) => {
      const { data, error } = await supabase.rpc('start_network_thread', {
        p_business_id: business!.id,
        p_supplier_profile_id: input.supplierProfileId,
        p_body: input.body,
        p_listing_id: input.listingId ?? null,
      })
      if (error) {
        console.error('[start_network_thread] failed', { input, error })
        throw error
      }
      return data as unknown as Database['public']['Tables']['network_threads']['Row']
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-threads', business?.id] })
    },
  })
}

export function useSendMessage() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { threadId: string; body: string }) => {
      const { data, error } = await supabase.rpc('send_network_message', {
        p_thread_id: input.threadId,
        p_body: input.body,
      })
      if (error) {
        console.error('[send_network_message] failed', { threadId: input.threadId, error })
        throw error
      }
      return data as unknown as NetworkMessage
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['network-messages', input.threadId] })
      qc.invalidateQueries({ queryKey: ['network-threads', business?.id] })
    },
  })
}

export function useMarkThreadRead() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase.rpc('mark_network_thread_read', { p_thread_id: threadId })
      if (error) {
        console.error('[mark_network_thread_read] failed', { threadId, error })
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-threads', business?.id] })
    },
  })
}

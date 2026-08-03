import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { ConnectStatus, Database, SupplierVerification } from '@/types/database'

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

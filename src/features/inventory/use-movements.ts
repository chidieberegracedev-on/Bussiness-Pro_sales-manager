import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { StockMovementType } from '@/types/database'

export interface MovementRow {
  id: string
  business_id: string
  location_id: string
  variant_id: string
  movement_type: StockMovementType
  quantity: string
  unit_cost: string
  qty_after: string
  avg_cost_after: string
  purchase_unit_qty: string | null
  purchase_unit: string | null
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
  created_by_profile: { full_name: string | null } | null
  variant: {
    variant_name: string | null
    option_values: string[]
    product: { name: string } | null
  } | null
}

const SELECT = `
  id, business_id, location_id, variant_id, movement_type, quantity, unit_cost,
  qty_after, avg_cost_after, purchase_unit_qty, purchase_unit,
  reference_type, reference_id, note, created_by, created_at,
  created_by_profile:profiles!stock_movements_created_by_fkey(full_name),
  variant:product_variants(variant_name, option_values, product:products(name))
`

export function useRecentMovements(variantIds: string[] | undefined, limit = 10) {
  return useQuery({
    queryKey: ['movements', 'recent', variantIds],
    queryFn: async (): Promise<MovementRow[]> => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(SELECT)
        .in('variant_id', variantIds!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as unknown as MovementRow[]
    },
    enabled: !!variantIds && variantIds.length > 0,
  })
}

export interface MovementHistoryFilters {
  variantId?: string
  productId?: string
  movementType?: StockMovementType | 'all'
  from?: string
  to?: string
}

async function resolveVariantIds(productId: string): Promise<string[]> {
  const { data, error } = await supabase.from('product_variants').select('id').eq('product_id', productId)
  if (error) throw error
  return (data ?? []).map((r) => r.id)
}

function applyFilters<T>(
  query: T & { eq: any; in: any; gte: any; lte: any },
  filters: MovementHistoryFilters,
  productVariantIds: string[] | null,
) {
  let q = query
  if (filters.variantId) q = q.eq('variant_id', filters.variantId)
  if (!filters.variantId && productVariantIds) q = q.in('variant_id', productVariantIds)
  if (filters.movementType && filters.movementType !== 'all') q = q.eq('movement_type', filters.movementType)
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to) q = q.lte('created_at', filters.to)
  return q
}

export function useMovementHistory(filters: MovementHistoryFilters, page: number, pageSize = 50) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['movements', 'history', business?.id, filters, page, pageSize],
    queryFn: async () => {
      const productVariantIds = filters.productId ? await resolveVariantIds(filters.productId) : null

      let query = supabase
        .from('stock_movements')
        .select(SELECT, { count: 'exact' })
        .eq('business_id', business!.id) as any
      query = applyFilters(query, filters, productVariantIds)

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (error) throw error
      return { rows: (data ?? []) as unknown as MovementRow[], total: count ?? 0 }
    },
    enabled: !!business,
  })
}

const EXPORT_CAP = 10000

/** Fetches the full filtered set (uncapped by page size) for CSV export. */
export async function fetchMovementsForExport(businessId: string, filters: MovementHistoryFilters): Promise<MovementRow[]> {
  const productVariantIds = filters.productId ? await resolveVariantIds(filters.productId) : null

  let query = supabase.from('stock_movements').select(SELECT).eq('business_id', businessId) as any
  query = applyFilters(query, filters, productVariantIds)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(EXPORT_CAP)
  if (error) throw error
  return (data ?? []) as unknown as MovementRow[]
}

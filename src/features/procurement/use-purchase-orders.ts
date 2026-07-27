import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database, PoStatus } from '@/types/database'

export type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row']
export type PurchaseOrderItem = Database['public']['Tables']['purchase_order_items']['Row']
export type PurchaseOrderSummary = Database['public']['Views']['v_purchase_order_summary']['Row']
export type GoodsReceipt = Database['public']['Tables']['goods_receipts']['Row']
export type GoodsReceiptItem = Database['public']['Tables']['goods_receipt_items']['Row']

export interface PoListFilters {
  status?: PoStatus | 'all'
  supplierId?: string | 'all'
}

export function usePurchaseOrders(filters: PoListFilters = {}) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['purchase-orders', business?.id, filters],
    queryFn: async () => {
      let q = supabase
        .from('v_purchase_order_summary')
        .select('*')
        .eq('business_id', business!.id)
        .order('created_at', { ascending: false })
        .limit(500)
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.supplierId && filters.supplierId !== 'all') q = q.eq('supplier_id', filters.supplierId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PurchaseOrderSummary[]
    },
    enabled: !!business,
  })
}

export interface PurchaseOrderDetail {
  order: PurchaseOrder & { supplier_name: string; location_name: string; created_by_name: string | null }
  items: PurchaseOrderItem[]
  receipts: (GoodsReceipt & {
    items: GoodsReceiptItem[]
    received_by_name: string | null
  })[]
}

export function usePurchaseOrderDetail(id: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['purchase-order', business?.id, id],
    queryFn: async (): Promise<PurchaseOrderDetail> => {
      const { data: order, error: orderErr } = await supabase
        .from('purchase_orders')
        .select(
          '*, suppliers!inner(name), locations!inner(name), profiles(full_name)',
        )
        .eq('id', id!)
        .eq('business_id', business!.id)
        .single()
      if (orderErr) throw orderErr
      type OrderRow = PurchaseOrder & {
        suppliers: { name: string }
        locations: { name: string }
        profiles: { full_name: string | null } | null
      }
      const o = order as unknown as OrderRow

      const { data: items, error: itemsErr } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id!)
        .order('created_at', { ascending: true })
      if (itemsErr) throw itemsErr

      const { data: receiptsData, error: recErr } = await supabase
        .from('goods_receipts')
        .select('*, profiles(full_name)')
        .eq('po_id', id!)
        .order('received_at', { ascending: false })
      if (recErr) throw recErr
      type ReceiptRow = GoodsReceipt & { profiles: { full_name: string | null } | null }

      const receiptIds = (receiptsData ?? []).map((r) => r.id)
      let receiptItems: GoodsReceiptItem[] = []
      if (receiptIds.length > 0) {
        const { data: ri, error: riErr } = await supabase
          .from('goods_receipt_items')
          .select('*')
          .in('receipt_id', receiptIds)
        if (riErr) throw riErr
        receiptItems = (ri ?? []) as GoodsReceiptItem[]
      }

      return {
        order: {
          ...o,
          supplier_name: o.suppliers.name,
          location_name: o.locations.name,
          created_by_name: o.profiles?.full_name ?? null,
        },
        items: (items ?? []) as PurchaseOrderItem[],
        receipts: ((receiptsData ?? []) as unknown as ReceiptRow[]).map((r) => ({
          ...r,
          received_by_name: r.profiles?.full_name ?? null,
          items: receiptItems.filter((i) => i.receipt_id === r.id),
        })),
      }
    },
    enabled: !!business && !!id,
  })
}

export interface CreatePoInput {
  poId: string
  supplierId: string
  status: 'draft' | 'ordered'
  note?: string | null
  items: {
    variant_id: string
    qty_ordered_purchase: string
    expected_unit_cost: string
  }[]
}

export function useCreatePurchaseOrder() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreatePoInput) => {
      const { data, error } = await supabase.rpc('create_purchase_order', {
        p_po_id: input.poId,
        p_business_id: business!.id,
        p_supplier_id: input.supplierId,
        p_items: input.items,
        p_status: input.status,
        p_note: input.note ?? null,
      })
      if (error) throw error
      return data as PurchaseOrder
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', business?.id] })
    },
  })
}

export interface ReceiveGoodsInput {
  receiptId: string
  poId: string
  note?: string | null
  items: {
    po_item_id: string
    qty_received_purchase: string
    qty_good_purchase: string
    qty_damaged_base?: string
    qty_discrepancy_base?: string
    discrepancy_reason?: string
    unit_cost_purchase: string
    movement_id: string
    note?: string | null
  }[]
}

export function useReceiveGoods() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: ReceiveGoodsInput) => {
      const { data, error } = await supabase.rpc('receive_goods', {
        p_receipt_id: input.receiptId,
        p_po_id: input.poId,
        p_items: input.items,
        p_note: input.note ?? null,
      })
      if (error) throw error
      return data as GoodsReceipt
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders', business?.id] })
      qc.invalidateQueries({ queryKey: ['purchase-order', business?.id, variables.poId] })
      qc.invalidateQueries({ queryKey: ['product-list', business?.id] })
      qc.invalidateQueries({ queryKey: ['low-stock', business?.id] })
      qc.invalidateQueries({ queryKey: ['restock-suggestions', business?.id] })
    },
  })
}

// Fetch supplier links for a given supplier to prefill PO lines (per-variant).
export function useSupplierLinksMap(supplierId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['supplier-links-map', business?.id, supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_suppliers')
        .select('variant_id, purchase_unit, conversion_to_base, last_purchase_cost')
        .eq('business_id', business!.id)
        .eq('supplier_id', supplierId!)
      if (error) throw error
      const map = new Map<
        string,
        { purchase_unit: string; conversion_to_base: string; last_purchase_cost: string | null }
      >()
      for (const row of data ?? []) {
        map.set(row.variant_id, {
          purchase_unit: row.purchase_unit,
          conversion_to_base: row.conversion_to_base,
          last_purchase_cost: row.last_purchase_cost,
        })
      }
      return map
    },
    enabled: !!business && !!supplierId,
  })
}

// Fetch fallback product-level purchase settings for a variant.
export function useVariantPurchaseDefaults() {
  const { business } = useActiveBusiness()

  return async (variantIds: string[]) => {
    if (variantIds.length === 0) return new Map<string, { unit: string; conversion: string }>()
    const { data, error } = await supabase
      .from('product_variants')
      .select('id, products!inner(base_unit, purchase_unit, purchase_conversion_qty)')
      .eq('business_id', business!.id)
      .in('id', variantIds)
    if (error) throw error
    type Row = { id: string; products: { base_unit: string; purchase_unit: string | null; purchase_conversion_qty: string | null } }
    const map = new Map<string, { unit: string; conversion: string }>()
    for (const row of (data ?? []) as unknown as Row[]) {
      map.set(row.id, {
        unit: row.products.purchase_unit ?? row.products.base_unit,
        conversion: row.products.purchase_conversion_qty ?? '1',
      })
    }
    return map
  }
}

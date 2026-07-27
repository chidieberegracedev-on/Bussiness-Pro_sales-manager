import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database } from '@/types/database'

export type Supplier = Database['public']['Tables']['suppliers']['Row']
export type ProductSupplier = Database['public']['Tables']['product_suppliers']['Row']

export function useSuppliers(includeInactive = false) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['suppliers', business?.id, { includeInactive }],
    queryFn: async () => {
      let q = supabase
        .from('suppliers')
        .select('*')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Supplier[]
    },
    enabled: !!business,
  })
}

export function useSupplier(id: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['supplier', business?.id, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id!)
        .eq('business_id', business!.id)
        .single()
      if (error) throw error
      return data as Supplier
    },
    enabled: !!business && !!id,
  })
}

export function useCreateSupplier() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      phone?: string | null
      email?: string | null
      address?: string | null
      notes?: string | null
    }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          business_id: business!.id,
          name: input.name,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          notes: input.notes || null,
        })
        .select()
        .single()
      if (error) throw error
      return data as Supplier
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers', business?.id] }),
  })
}

export function useUpdateSupplier() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      phone?: string | null
      email?: string | null
      address?: string | null
      notes?: string | null
      is_active?: boolean
    }) => {
      const { id, ...patch } = input
      const { data, error } = await supabase
        .from('suppliers')
        .update(patch)
        .eq('id', id)
        .eq('business_id', business!.id)
        .select()
        .single()
      if (error) throw error
      return data as Supplier
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['suppliers', business?.id] })
      qc.invalidateQueries({ queryKey: ['supplier', business?.id, variables.id] })
    },
  })
}

export interface ProductSupplierRow extends ProductSupplier {
  product_name: string
  variant_name: string | null
  base_unit: string
}

export function useSupplierLinks(supplierId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['supplier-links', business?.id, supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_suppliers')
        .select(
          'id, business_id, variant_id, supplier_id, supplier_sku, purchase_unit, conversion_to_base, last_purchase_cost, is_preferred, created_at, updated_at, product_variants!inner(variant_name, products!inner(name, base_unit))',
        )
        .eq('business_id', business!.id)
        .eq('supplier_id', supplierId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      type Raw = ProductSupplier & {
        product_variants: {
          variant_name: string | null
          products: { name: string; base_unit: string }
        }
      }
      return ((data ?? []) as unknown as Raw[]).map(
        (r): ProductSupplierRow => ({
          ...r,
          product_name: r.product_variants.products.name,
          variant_name: r.product_variants.variant_name,
          base_unit: r.product_variants.products.base_unit,
        }),
      )
    },
    enabled: !!business && !!supplierId,
  })
}

export function useVariantSuppliers(variantId: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['variant-suppliers', business?.id, variantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_suppliers')
        .select('*, suppliers!inner(name)')
        .eq('business_id', business!.id)
        .eq('variant_id', variantId!)
      if (error) throw error
      type Raw = ProductSupplier & { suppliers: { name: string } }
      return ((data ?? []) as unknown as Raw[]).map((r) => ({
        ...r,
        supplier_name: r.suppliers.name,
      }))
    },
    enabled: !!business && !!variantId,
  })
}

export function useCreateLink() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      variantId: string
      supplierId: string
      supplierSku?: string | null
      purchaseUnit: string
      conversionToBase: string
      lastPurchaseCost?: string | null
      isPreferred: boolean
    }) => {
      if (input.isPreferred) {
        await supabase
          .from('product_suppliers')
          .update({ is_preferred: false })
          .eq('business_id', business!.id)
          .eq('variant_id', input.variantId)
      }
      const { data, error } = await supabase
        .from('product_suppliers')
        .insert({
          business_id: business!.id,
          variant_id: input.variantId,
          supplier_id: input.supplierId,
          supplier_sku: input.supplierSku || null,
          purchase_unit: input.purchaseUnit,
          conversion_to_base: input.conversionToBase,
          last_purchase_cost: input.lastPurchaseCost || null,
          is_preferred: input.isPreferred,
        })
        .select()
        .single()
      if (error) throw error
      return data as ProductSupplier
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['supplier-links', business?.id, variables.supplierId] })
      qc.invalidateQueries({ queryKey: ['variant-suppliers', business?.id, variables.variantId] })
    },
  })
}

export function useUpdateLink() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      variantId: string
      supplierId: string
      supplierSku?: string | null
      purchaseUnit?: string
      conversionToBase?: string
      lastPurchaseCost?: string | null
      isPreferred?: boolean
    }) => {
      if (input.isPreferred) {
        await supabase
          .from('product_suppliers')
          .update({ is_preferred: false })
          .eq('business_id', business!.id)
          .eq('variant_id', input.variantId)
          .neq('id', input.id)
      }
      const patch: Partial<ProductSupplier> = {}
      if (input.supplierSku !== undefined) patch.supplier_sku = input.supplierSku || null
      if (input.purchaseUnit !== undefined) patch.purchase_unit = input.purchaseUnit
      if (input.conversionToBase !== undefined) patch.conversion_to_base = input.conversionToBase
      if (input.lastPurchaseCost !== undefined) patch.last_purchase_cost = input.lastPurchaseCost || null
      if (input.isPreferred !== undefined) patch.is_preferred = input.isPreferred
      const { data, error } = await supabase
        .from('product_suppliers')
        .update(patch)
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      return data as ProductSupplier
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['supplier-links', business?.id, variables.supplierId] })
      qc.invalidateQueries({ queryKey: ['variant-suppliers', business?.id, variables.variantId] })
    },
  })
}

export function useDeleteLink() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; supplierId: string; variantId: string }) => {
      const { error } = await supabase.from('product_suppliers').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['supplier-links', business?.id, variables.supplierId] })
      qc.invalidateQueries({ queryKey: ['variant-suppliers', business?.id, variables.variantId] })
    },
  })
}

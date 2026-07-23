import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useHasMovements(variantIds: string[] | undefined) {
  return useQuery({
    queryKey: ['has-movements', variantIds],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .in('variant_id', variantIds!)
      if (error) throw error
      return (count ?? 0) > 0
    },
    enabled: !!variantIds && variantIds.length > 0,
  })
}

export interface ProductUpdateInput {
  id: string
  name: string
  description: string | null
  category_id: string | null
  image_path: string | null
  base_unit: string
  purchase_unit: string | null
  purchase_conversion_qty: string | null
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductUpdateInput) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('products').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['product-variants', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['product-list'] })
    },
  })
}

export interface VariantUpdateInput {
  id: string
  productId: string
  sku: string | null
  barcode: string | null
  selling_price: string
  low_stock_threshold: string
}

export function useUpdateVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: VariantUpdateInput) => {
      const { id, productId: _productId, ...patch } = input
      const { error } = await supabase.from('product_variants').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', variables.productId] })
      queryClient.invalidateQueries({ queryKey: ['product-list'] })
    },
  })
}

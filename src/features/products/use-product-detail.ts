import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { VariantStockRow } from '@/features/products/types'

export interface ProductDetail {
  id: string
  business_id: string
  name: string
  description: string | null
  category_id: string | null
  image_path: string | null
  base_unit: string
  purchase_unit: string | null
  purchase_conversion_qty: string | null
  has_variants: boolean
  option_names: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export function useProductDetail(productId: string | undefined) {
  const { business } = useActiveBusiness()

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: async (): Promise<ProductDetail> => {
      const { data, error } = await supabase.from('products').select('*').eq('id', productId!).single()
      if (error) throw error
      return data
    },
    enabled: !!productId,
  })

  const variantsQuery = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async (): Promise<VariantStockRow[]> => {
      const { data, error } = await supabase
        .from('v_variant_stock')
        .select('*')
        .eq('product_id', productId!)
        .order('variant_name', { ascending: true, nullsFirst: true })
      if (error) throw error
      return (data ?? []) as unknown as VariantStockRow[]
    },
    enabled: !!productId && !!business,
  })

  return {
    product: productQuery.data,
    variants: variantsQuery.data,
    isLoading: productQuery.isLoading || variantsQuery.isLoading,
    isError: productQuery.isError || variantsQuery.isError,
    error: productQuery.error || variantsQuery.error,
    refetch: () => {
      productQuery.refetch()
      variantsQuery.refetch()
    },
  }
}

export function useToggleProductActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['product-variants', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['product-list'] })
    },
  })
}

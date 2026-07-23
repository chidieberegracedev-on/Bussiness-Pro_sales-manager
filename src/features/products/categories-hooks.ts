import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

export function useCategories() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['categories', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!business,
  })
}

export function useCreateCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('product_categories')
        .insert({ business_id: business!.id, name: name.trim() })
        .select('id, name')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}

export function useRenameCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('product_categories').update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}

export function useDeleteCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}

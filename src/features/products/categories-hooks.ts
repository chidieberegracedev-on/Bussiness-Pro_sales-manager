import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

export interface Category {
  id: string
  name: string
  /** Curated icon key or a single emoji. Visual metadata, never a file path. */
  icon: string | null
}

export function useCategories() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['categories', business?.id],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name, icon')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => ({ id: r.id, name: r.name, icon: r.icon ?? null }))
    },
    enabled: !!business,
  })
}

export function useCreateCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: string | { name: string; icon?: string | null }): Promise<Category> => {
      const name = (typeof input === 'string' ? input : input.name).trim()
      const icon = typeof input === 'string' ? null : (input.icon ?? null)

      const { data, error } = await supabase
        .from('product_categories')
        .insert({ business_id: business!.id, name, icon })
        .select('id, name, icon')
        .single()
      if (error) throw error
      return { id: data.id, name: data.name, icon: data.icon ?? null }
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

export function useSetCategoryIcon() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, icon }: { id: string; icon: string | null }) => {
      const { error } = await supabase.from('product_categories').update({ icon }).eq('id', id)
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database } from '@/types/database'

export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']

export function useExpenseCategories(includeInactive = false) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['expense-categories', business?.id, { includeInactive }],
    queryFn: async () => {
      let q = supabase
        .from('expense_categories')
        .select('*')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ExpenseCategory[]
    },
    enabled: !!business,
  })
}

export function useCreateExpenseCategory() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({ business_id: business!.id, name })
        .select()
        .single()
      if (error) throw error
      return data as ExpenseCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-categories', business?.id] }),
  })
}

export function useUpdateExpenseCategory() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; is_active?: boolean }) => {
      const { id, ...patch } = input
      const { data, error } = await supabase
        .from('expense_categories')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ExpenseCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-categories', business?.id] }),
  })
}

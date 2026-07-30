import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/features/auth/store'
import type { CalculatorKind, Database } from '@/types/database'

export type CalculatorHistoryRow = Database['public']['Tables']['calculator_history']['Row']

export function useCalculatorHistory(limit = 30) {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useQuery({
    queryKey: ['calculator-history', userId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calculator_history')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as CalculatorHistoryRow[]
    },
    enabled: !!userId,
  })
}

export function useSaveCalculation() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { kind: CalculatorKind; expression: string; result: string }) => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('calculator_history')
        .insert({
          user_id: userId,
          kind: input.kind,
          expression: input.expression,
          result: input.result,
        })
        .select()
        .single()
      if (error) throw error
      return data as CalculatorHistoryRow
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calculator-history', userId] }),
  })
}

export function useClearCalculatorHistory() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('calculator_history').delete().eq('user_id', userId!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calculator-history', userId] }),
  })
}

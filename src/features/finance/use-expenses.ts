import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { CashSource, Database } from '@/types/database'

export type Expense = Database['public']['Tables']['expenses']['Row']

export interface ExpenseRow extends Expense {
  category_name: string | null
  recorded_by_name: string | null
}

export interface ExpenseFilters {
  from?: string
  to?: string
  categoryId?: string | 'all'
  paidFrom?: CashSource | 'all'
}

export function useExpenses(filters: ExpenseFilters = {}) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['expenses', business?.id, filters],
    queryFn: async () => {
      let q = supabase
        .from('expenses')
        .select('*, expense_categories(name), profiles(full_name)')
        .eq('business_id', business!.id)
        .order('spent_at', { ascending: false })
        .limit(500)
      if (filters.from) q = q.gte('spent_at', filters.from)
      if (filters.to) q = q.lte('spent_at', filters.to)
      if (filters.categoryId && filters.categoryId !== 'all') q = q.eq('category_id', filters.categoryId)
      if (filters.paidFrom && filters.paidFrom !== 'all') q = q.eq('paid_from', filters.paidFrom)
      const { data, error } = await q
      if (error) throw error
      type Raw = Expense & {
        expense_categories: { name: string } | null
        profiles: { full_name: string | null } | null
      }
      return ((data ?? []) as unknown as Raw[]).map(
        (r): ExpenseRow => ({
          ...r,
          category_name: r.expense_categories?.name ?? null,
          recorded_by_name: r.profiles?.full_name ?? null,
        }),
      )
    },
    enabled: !!business,
  })
}

export interface RecordExpenseInput {
  amount: string
  paidFrom: CashSource
  categoryId?: string | null
  description?: string | null
  locationId?: string | null
  shiftId?: string | null
  spentAt?: string
}

export function useRecordExpense() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: RecordExpenseInput) => {
      const { data, error } = await supabase.rpc('record_expense', {
        p_expense_id: crypto.randomUUID(),
        p_business_id: business!.id,
        p_amount: Number(input.amount),
        p_paid_from: input.paidFrom,
        p_category_id: input.categoryId ?? null,
        p_description: input.description ?? null,
        p_location_id: input.locationId ?? null,
        p_shift_id: input.shiftId ?? null,
        p_spent_at: input.spentAt ?? new Date().toISOString(),
      })
      if (error) {
        console.error('[record_expense] failed', { input, error })
        throw error
      }
      return data as Expense
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', business?.id] })
      qc.invalidateQueries({ queryKey: ['financial-position', business?.id] })
      qc.invalidateQueries({ queryKey: ['cashbook', business?.id] })
    },
  })
}

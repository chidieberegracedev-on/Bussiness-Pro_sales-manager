import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { SaleSummaryRow } from '@/features/sales/use-sales-list'

type SaleItemRow = Database['public']['Tables']['sale_items']['Row']
type SalePaymentRow = Database['public']['Tables']['sale_payments']['Row']

export function useSaleDetail(saleId: string | undefined) {
  return useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: async () => {
      const [saleRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from('v_sale_summary').select('*').eq('id', saleId!).single(),
        supabase.from('sale_items').select('*').eq('sale_id', saleId!).order('created_at', { ascending: true }),
        supabase.from('sale_payments').select('*').eq('sale_id', saleId!).order('created_at', { ascending: true }),
      ])
      if (saleRes.error) throw saleRes.error
      if (itemsRes.error) throw itemsRes.error
      if (paymentsRes.error) throw paymentsRes.error

      return {
        sale: saleRes.data as SaleSummaryRow,
        items: (itemsRes.data ?? []) as SaleItemRow[],
        payments: (paymentsRes.data ?? []) as SalePaymentRow[],
      }
    },
    enabled: !!saleId,
  })
}

export function useVoidSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ saleId, reason }: { saleId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc('void_sale', { p_sale_id: saleId, p_reason: reason ?? null })
      if (error) {
        console.error('[void_sale] failed', error)
        throw error
      }
      return data
    },
    onSuccess: (_data, variables) => {
      // Stock movements were reversed server-side — every surface reading
      // current stock or sales totals must reflect that immediately.
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['product-list'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['sale-items', variables.saleId] })
    },
  })
}

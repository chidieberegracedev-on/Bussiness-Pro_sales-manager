import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  note: string | null
}

/**
 * Customer lookup for the counter.
 *
 * Search covers name AND phone because phone is how a shop actually finds
 * someone mid-queue — "it's under 080…", not "it's under Grace". Empty search
 * returns the most recent, so the picker opens on something rather than blank.
 */
export function useCustomers(search: string) {
  const { business } = useActiveBusiness()
  const debounced = useDebouncedValue(search, 200)

  return useQuery({
    queryKey: ['customers', business?.id, debounced],
    queryFn: async (): Promise<Customer[]> => {
      let q = supabase
        .from('customers')
        .select('id, name, phone, email, note')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })
        .limit(30)
      const term = debounced.trim()
      if (term) {
        const escaped = term.replace(/[%,]/g, '')
        q = q.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Customer[]
    },
    enabled: !!business,
    staleTime: 20_000,
  })
}

export function useCreateCustomer() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      phone?: string | null
      email?: string | null
    }): Promise<Customer> => {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          business_id: business!.id,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
        })
        .select('id, name, phone, email, note')
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', business?.id] }),
  })
}

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import type { Database, BusinessVertical } from '@/types/database'

export type PosConfig = Database['public']['Tables']['business_pos_config']['Row']

/**
 * Every business gets a config row from 0029's backfill, but a business
 * created before this hook runs — or a database where 0029 hasn't been applied
 * — must not leave the till blank. These defaults ARE the general vertical, so
 * a missing row behaves exactly like the baseline POS.
 */
const FALLBACK: Omit<PosConfig, 'business_id' | 'updated_at'> = {
  product_view: 'grid',
  category_first: true,
  show_product_images: true,
  barcode_first: true,
  allow_hold_resume: true,
  capture_customer: false,
  allow_line_discount: true,
  tables_enabled: false,
  modifiers_enabled: false,
  kitchen_workflow_enabled: false,
  variants_enabled: false,
  returns_enabled: false,
  receipt_footer: null,
  free_form: {},
}

export function usePosConfig() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['pos-config', business?.id],
    queryFn: async (): Promise<PosConfig> => {
      const { data, error } = await supabase
        .from('business_pos_config')
        .select('*')
        .eq('business_id', business!.id)
        .maybeSingle()

      // 42P01 = undefined_table. Before 0029 is applied the till would 404 on
      // every load; the baseline config is the correct answer for a database
      // that has never heard of vertical configuration.
      if (error && error.code !== '42P01') {
        console.error('[business_pos_config] failed', error)
        throw error
      }
      if (error) {
        console.warn('[business_pos_config] table missing — apply migration 0029')
      }

      return {
        ...FALLBACK,
        ...(data ?? {}),
        business_id: business!.id,
        updated_at: (data as PosConfig | null)?.updated_at ?? new Date().toISOString(),
      }
    },
    enabled: !!business,
    staleTime: 5 * 60_000,
  })
}

/**
 * The vertical, defaulted.
 *
 * Read this rather than `business.business_type` directly: a row that predates
 * 0029 has no column at all, and an undefined vertical must behave as
 * 'general' rather than switching off the POS.
 */
export function useBusinessVertical(): BusinessVertical {
  const { business } = useActiveBusiness()
  const type = (business as { business_type?: BusinessVertical } | undefined)?.business_type
  return type ?? 'general'
}

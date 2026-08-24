import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
 * Presets per vertical.
 *
 * Changing the business type sets the switches that define that personality,
 * and the owner can still override any of them afterwards. This is what keeps
 * "one engine, configurable experience" honest: the type is a shortcut to a
 * config, never a second code path.
 */
export const VERTICAL_PRESETS: Record<
  BusinessVertical,
  Partial<Omit<PosConfig, 'business_id' | 'updated_at'>>
> = {
  general: {
    product_view: 'grid',
    category_first: false,
    show_product_images: true,
    barcode_first: true,
    variants_enabled: false,
    tables_enabled: false,
    modifiers_enabled: false,
    kitchen_workflow_enabled: false,
  },
  grocery: {
    // A grocery till is a scanner with a screen attached. Images cost space
    // and a grocery catalog is mostly barcoded, so the list view fits more
    // lines and the scanner leads.
    product_view: 'list',
    category_first: false,
    show_product_images: false,
    barcode_first: true,
    variants_enabled: false,
    tables_enabled: false,
    modifiers_enabled: false,
    kitchen_workflow_enabled: false,
  },
  boutique: {
    // Apparel is chosen by eye and then by size, so images lead and the
    // variant picker is the main interaction.
    product_view: 'grid',
    category_first: true,
    show_product_images: true,
    barcode_first: false,
    variants_enabled: true,
    returns_enabled: true,
    capture_customer: true,
    tables_enabled: false,
    modifiers_enabled: false,
    kitchen_workflow_enabled: false,
  },
  restaurant: {
    product_view: 'grid',
    category_first: true,
    show_product_images: true,
    barcode_first: false,
    variants_enabled: false,
    tables_enabled: true,
    modifiers_enabled: true,
    kitchen_workflow_enabled: true,
  },
}

export function useUpdatePosConfig() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<Omit<PosConfig, 'business_id' | 'updated_at'>>) => {
      // upsert, not update: a business whose backfill row is missing must not
      // silently discard the change.
      const { error } = await supabase
        .from('business_pos_config')
        .upsert({ business_id: business!.id, ...patch }, { onConflict: 'business_id' })
      if (error) {
        console.error('[business_pos_config.upsert] failed', { patch, error })
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-config', business?.id] }),
  })
}

/** Switching vertical applies its preset and keeps everything else as-is. */
export function useSetBusinessVertical() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vertical: BusinessVertical) => {
      const { error } = await supabase
        .from('businesses')
        .update({ business_type: vertical })
        .eq('id', business!.id)
      if (error) {
        console.error('[businesses.business_type] failed', { vertical, error })
        throw error
      }

      const { error: configError } = await supabase
        .from('business_pos_config')
        .upsert(
          { business_id: business!.id, ...VERTICAL_PRESETS[vertical] },
          { onConflict: 'business_id' },
        )
      if (configError) {
        console.error('[vertical preset] failed', { vertical, configError })
        throw configError
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-config', business?.id] })
      qc.invalidateQueries({ queryKey: ['memberships'] })
    },
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

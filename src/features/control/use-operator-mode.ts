import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

/**
 * Flips the business from single-owner into multi-operator mode.
 *
 * This is the switch that turns the entire Phase 8 control layer on: operator
 * selection, PIN unlock, terminal binding, shift enforcement. Nothing before
 * this call shows a lock screen, and nothing after it lets an unidentified
 * person work a till.
 *
 * The server refuses unless the acting owner already has a PIN, so a business
 * can never enter employee mode with an owner who can't sign back in.
 */
export function useEnableOperatorMode() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('enable_operator_mode', {
        p_business_id: business!.id,
      })
      if (error) {
        console.error('[enable_operator_mode] failed', error)
        throw error
      }
    },
    // The mode lives on the business row, which rides along with the membership.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
  })
}

/**
 * Returns to single-owner mode. The server refuses while any active non-owner
 * operator still exists, so this is only reachable once the staff are gone.
 */
export function useDisableOperatorMode() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('disable_operator_mode', {
        p_business_id: business!.id,
      })
      if (error) {
        console.error('[disable_operator_mode] failed', error)
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
  })
}

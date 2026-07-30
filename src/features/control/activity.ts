import { supabase } from '@/lib/supabase'
import { readToken } from '@/features/control/session-store'
import type { ActivitySeverity } from '@/types/database'

export interface ActorActivityInput {
  businessId: string
  actionType: string
  authorizedBy?: string | null
  terminalId?: string | null
  shiftId?: string | null
  referenceType?: string | null
  referenceId?: string | null
  severity?: ActivitySeverity
  detail?: Record<string, unknown>
}

/**
 * Records an activity event attributed to the current PIN session. The actor is
 * resolved from the token server-side — we deliberately never send a member id
 * (BR-C1.4).
 *
 * Activity is a trail, not a gate: a failure here is logged and swallowed so it
 * can never block the operational action the cashier was performing.
 */
export async function recordActorActivity(input: ActorActivityInput): Promise<void> {
  const token = readToken()
  try {
    const { error } = await supabase.rpc('record_activity_as_actor', {
      p_business_id: input.businessId,
      p_action_type: input.actionType,
      p_actor_token: token,
      p_authorized_by: input.authorizedBy ?? null,
      p_terminal_id: input.terminalId ?? null,
      p_shift_id: input.shiftId ?? null,
      p_reference_type: input.referenceType ?? null,
      p_reference_id: input.referenceId ?? null,
      p_severity: input.severity ?? 'info',
      p_detail: input.detail ?? {},
    })
    if (error) console.error('[record_activity_as_actor] failed', { input, error })
  } catch (error) {
    console.error('[record_activity_as_actor] threw', { input, error })
  }
}

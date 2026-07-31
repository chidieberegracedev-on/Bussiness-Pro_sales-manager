import { supabase } from '@/lib/supabase'
import { readToken } from '@/features/control/session-store'
import type { ActivitySeverity } from '@/types/database'

export interface ActorActivityInput {
  businessId: string
  actionType: string
  /**
   * The member id to attribute to when there is no PIN session — i.e. the
   * account holder acting in single-owner mode, where they are the only person
   * who could have done it. Ignored whenever a session token exists, so it can
   * never be used to claim someone else's work.
   */
  fallbackMemberId?: string | null
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

  // No PIN session: single-owner mode, where the signed-in account holder is
  // the actor. record_activity_as_actor would file this with initiated_by null,
  // which reads as "unknown operator" on every management view.
  if (!token && input.fallbackMemberId) {
    try {
      const { error } = await supabase.rpc('record_activity', {
        p_business_id: input.businessId,
        p_action_type: input.actionType,
        p_initiated_by: input.fallbackMemberId,
        p_authorized_by: input.authorizedBy ?? null,
        p_terminal_id: input.terminalId ?? null,
        p_shift_id: input.shiftId ?? null,
        p_reference_type: input.referenceType ?? null,
        p_reference_id: input.referenceId ?? null,
        p_severity: input.severity ?? 'info',
        p_detail: input.detail ?? {},
      })
      if (error) console.error('[record_activity] failed', { input, error })
    } catch (error) {
      console.error('[record_activity] threw', { input, error })
    }
    return
  }

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

import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { readToken, readSessionContext } from '@/features/control/session-store'
import type { AuthorizationGrant, AuthorizedAction, Database, MemberRole } from '@/types/database'

export type PermissionLimit = Database['public']['Tables']['permission_limits']['Row']

export interface AuthorizationContext {
  amount?: string | number | null
  percent?: string | number | null
  quantity?: string | number | null
  shiftId?: string | null
}

/**
 * Calls the one server-side authorization pipeline. The client decides nothing:
 * a `granted:false, requires_authorization:true` response is the server telling
 * us to collect an approver PIN, and the re-call validates that PIN server-side
 * (BR-C4.1 / BR-C4.3).
 */
export function useAuthorize() {
  const { business } = useActiveBusiness()

  return useMutation({
    mutationFn: async (input: {
      action: AuthorizedAction
      context?: AuthorizationContext
      approverMemberId?: string
      approverPin?: string
    }) => {
      const token = readToken()
      if (!token) throw new Error('No active session. Unlock the terminal first.')
      const ctx = readSessionContext()

      const { data, error } = await supabase.rpc('authorize', {
        p_business_id: business!.id,
        p_action: input.action,
        p_actor_token: token,
        p_amount: input.context?.amount != null ? Number(input.context.amount) : null,
        p_percent: input.context?.percent != null ? Number(input.context.percent) : null,
        p_quantity: input.context?.quantity != null ? Number(input.context.quantity) : null,
        p_terminal_id: ctx?.terminal_id ?? null,
        p_shift_id: input.context?.shiftId ?? null,
        p_approver_member_id: input.approverMemberId ?? null,
        p_approver_pin: input.approverPin ?? null,
      })
      if (error) {
        console.error('[authorize] failed', { action: input.action, error })
        throw error
      }
      return data as unknown as AuthorizationGrant
    },
  })
}

export interface PendingAuthorization {
  action: AuthorizedAction
  context?: AuthorizationContext
  resolve: (grant: AuthorizationGrant | null) => void
}

/**
 * Wraps a gated action: `request(action, context)` resolves to a grant, opening
 * the manager-PIN modal in between when the server says approval is needed.
 * Resolves null if the operator cancels — the caller then does nothing, and the
 * basket is untouched because we never navigated away.
 */
export function useAuthorizationGate() {
  const authorize = useAuthorize()
  const { membership, isMultiOperator } = useActiveBusiness()
  const [pending, setPending] = useState<PendingAuthorization | null>(null)

  // Permission limits exist to constrain employees. In single-owner mode there
  // are none, there is no PIN session for `authorize` to resolve an actor from,
  // and asking the owner to approve their own action is theatre. Server-side
  // RLS still governs the mutation itself — this only skips the approval step.
  const singleOwnerGrant = !isMultiOperator && membership?.id ? membership.id : null

  const request = useCallback(
    (action: AuthorizedAction, context?: AuthorizationContext): Promise<AuthorizationGrant | null> =>
      new Promise((resolve) => {
        if (singleOwnerGrant) {
          resolve({ granted: true, initiated_by: singleOwnerGrant })
          return
        }
        authorize.mutate(
          { action, context },
          {
            onSuccess: (grant) => {
              if (grant.granted) {
                resolve(grant)
                return
              }
              if (grant.requires_authorization) {
                // Hand off to the modal; it resolves this same promise.
                setPending({ action, context, resolve })
                return
              }
              resolve(null)
            },
            onError: () => resolve(null),
          },
        )
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [singleOwnerGrant],
  )

  function resolvePending(grant: AuthorizationGrant | null) {
    pending?.resolve(grant)
    setPending(null)
  }

  return {
    request,
    pending,
    resolvePending,
    isChecking: authorize.isPending,
  }
}

/**
 * Managers and owners who can approve an over-limit action.
 *
 * Reads v_operators, NOT an employee_pins embed. employee_pins carries RLS
 * `using (false)` so hashes can never be selected by any client — which also
 * means an embedded join against it comes back empty for everyone, every time.
 * Filtering on that embed silently produced an empty approver list, so the
 * manager-PIN modal had nobody to offer and no gated action could be approved.
 * The view exposes has_pin as a boolean through a SECURITY DEFINER helper;
 * the hash itself stays unreadable, and a forgotten PIN is reset via
 * reset_operator_pin — never revealed.
 */
export function useApprovers() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['approvers', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_operators')
        .select('member_id, role, display_name, has_pin, locked_until')
        .eq('business_id', business!.id)
        .eq('status', 'active')
        .in('role', ['owner', 'manager'])
      if (error) throw error
      type Raw = {
        member_id: string
        role: MemberRole
        display_name: string | null
        has_pin: boolean
        locked_until: string | null
      }
      const now = Date.now()
      return ((data ?? []) as unknown as Raw[])
        .filter((m) => m.has_pin)
        // A locked-out approver can't approve anything; offering them is a
        // dead end at exactly the moment somebody is waiting at a till.
        .filter((m) => !m.locked_until || new Date(m.locked_until).getTime() <= now)
        .map((m) => ({
          member_id: m.member_id,
          display_name: m.display_name ?? 'Unnamed',
          role: m.role,
        }))
    },
    enabled: !!business,
  })
}

export function usePermissionLimits() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['permission-limits', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_limits')
        .select('*')
        .eq('business_id', business!.id)
      if (error) throw error
      return (data ?? []) as PermissionLimit[]
    },
    enabled: !!business,
  })
}

export function useUpsertPermissionLimit() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      role: MemberRole
      action: AuthorizedAction
      max_amount?: string | null
      max_percent?: string | null
      max_quantity?: string | null
      allowed: boolean
    }) => {
      const { data, error } = await supabase
        .from('permission_limits')
        .upsert(
          {
            business_id: business!.id,
            role: input.role,
            action: input.action,
            max_amount: input.max_amount ?? null,
            max_percent: input.max_percent ?? null,
            max_quantity: input.max_quantity ?? null,
            allowed: input.allowed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'business_id,role,action' },
        )
        .select()
        .single()
      if (error) throw error
      return data as PermissionLimit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permission-limits', business?.id] }),
  })
}

export function useSeedPermissionLimits() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      // Base roles first, then inventory_staff (seeded by the later migration
      // because its enum value could not be referenced in 0012).
      const { error } = await supabase.rpc('seed_permission_limits', {
        p_business_id: business!.id,
      })
      if (error) throw error
      const { error: staffError } = await supabase.rpc('seed_inventory_staff_limits', {
        p_business_id: business!.id,
      })
      if (staffError) throw staffError
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permission-limits', business?.id] }),
  })
}

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
  const [pending, setPending] = useState<PendingAuthorization | null>(null)

  const request = useCallback(
    (action: AuthorizedAction, context?: AuthorizationContext): Promise<AuthorizationGrant | null> =>
      new Promise((resolve) => {
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
    [],
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

/** Managers and owners who can approve an over-limit action. */
export function useApprovers() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['approvers', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_members')
        .select('id, role, display_name, profiles(full_name), employee_pins(member_id)')
        .eq('business_id', business!.id)
        .eq('status', 'active')
        .in('role', ['owner', 'manager'])
      if (error) throw error
      type Raw = {
        id: string
        role: MemberRole
        display_name: string | null
        profiles: { full_name: string | null } | null
        employee_pins: { member_id: string }[] | null
      }
      return ((data ?? []) as unknown as Raw[])
        .filter((m) => (m.employee_pins?.length ?? 0) > 0)
        .map((m) => ({
          member_id: m.id,
          display_name: m.display_name ?? m.profiles?.full_name ?? 'Unnamed',
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

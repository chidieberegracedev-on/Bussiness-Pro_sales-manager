import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useProfile } from '@/features/auth/use-profile'
import type { Database, MemberRole, MemberStatus } from '@/types/database'

export type Terminal = Database['public']['Tables']['terminals']['Row']

export function useTerminals(includeInactive = false) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['terminals', business?.id, { includeInactive }],
    queryFn: async () => {
      let q = supabase
        .from('terminals')
        .select('*')
        .eq('business_id', business!.id)
        .order('device_name', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Terminal[]
    },
    enabled: !!business,
  })
}

export function useCreateTerminal() {
  const { business } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { deviceName: string; deviceType: string }) => {
      if (!location) throw new Error('No default location for this business.')
      const { data, error } = await supabase
        .from('terminals')
        .insert({
          business_id: business!.id,
          location_id: location.id,
          device_name: input.deviceName,
          device_type: input.deviceType,
        })
        .select()
        .single()
      if (error) throw error
      return data as Terminal
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terminals', business?.id] }),
  })
}

export function useUpdateTerminal() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      device_name?: string
      device_type?: string
      is_active?: boolean
    }) => {
      const { id, ...patch } = input
      const { data, error } = await supabase
        .from('terminals')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Terminal
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['terminals', business?.id] }),
  })
}

export interface EmployeeRow {
  member_id: string
  /** False for PIN-only operators, who have no Supabase account. */
  is_account_user: boolean
  display_name: string
  role: MemberRole
  status: string
  has_pin: boolean
  pin_locked_until: string | null
  created_at: string
}

/**
 * Reads v_operators rather than business_members.
 *
 * employee_pins is deliberately unreadable (RLS `using (false)`) so hashes can
 * never leak — which also means an embedded select against it always comes back
 * empty, and every operator reads as "No PIN". The view exposes has_pin as a
 * boolean without ever exposing the hash (0016).
 */
export function useEmployees() {
  const { business, membership } = useActiveBusiness()
  const { data: profile } = useProfile()
  const myName = membership?.display_name ?? profile?.full_name ?? null

  return useQuery({
    queryKey: ['employees', business?.id, membership?.id, myName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_operators')
        .select('*')
        .eq('business_id', business!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      type Raw = Database['public']['Views']['v_operators']['Row']
      return ((data ?? []) as Raw[]).map(
        (m): EmployeeRow => ({
          member_id: m.member_id,
          is_account_user: m.is_account_user,
          // The account holder's member row predates 0018 and may carry no
          // display_name. Their name is known — never show them "Unnamed".
          display_name:
            m.display_name ?? (m.member_id === membership?.id ? myName : null) ?? 'Unnamed',
          role: m.role,
          status: m.status,
          has_pin: m.has_pin,
          pin_locked_until: m.locked_until,
          created_at: m.created_at,
        }),
      )
    },
    enabled: !!business,
  })
}

function invalidateOperatorQueries(
  qc: ReturnType<typeof useQueryClient>,
  businessId: string | undefined,
) {
  qc.invalidateQueries({ queryKey: ['employees', businessId] })
  qc.invalidateQueries({ queryKey: ['terminal-employees', businessId] })
  qc.invalidateQueries({ queryKey: ['approvers', businessId] })
  qc.invalidateQueries({ queryKey: ['memberships'] })
}

/**
 * Creates a PIN-only operator — someone who works this business but has no
 * Supabase account of their own. Goes through create_operator rather than a
 * direct insert so the role rules (only an owner can mint an owner) and the
 * activity record are enforced server-side.
 */
export function useCreateOperator() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { displayName: string; role: MemberRole; pin?: string | null }) => {
      const { data, error } = await supabase.rpc('create_operator', {
        p_business_id: business!.id,
        p_display_name: input.displayName,
        p_role: input.role,
        p_pin: input.pin ?? null,
      })
      if (error) {
        console.error('[create_operator] failed', { input: { ...input, pin: undefined }, error })
        throw error
      }
      return data as Database['public']['Tables']['business_members']['Row']
    },
    onSuccess: () => invalidateOperatorQueries(qc, business?.id),
  })
}

/**
 * Owner/manager PIN reset. The business is authenticated by the Supabase login,
 * so control of that login IS the recovery channel — an authenticated owner can
 * reset anyone's PIN, including their own. A locked-out owner recovers through
 * the normal Supabase email password reset, then resets their PIN from inside.
 */
export function useResetOperatorPin() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { memberId: string; newPin: string }) => {
      const { error } = await supabase.rpc('reset_operator_pin', {
        p_business_id: business!.id,
        p_member_id: input.memberId,
        p_new_pin: input.newPin,
      })
      if (error) {
        console.error('[reset_operator_pin] failed', { memberId: input.memberId, error })
        throw error
      }
    },
    onSuccess: () => invalidateOperatorQueries(qc, business?.id),
  })
}

export function useUpdateEmployeeRole() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      memberId: string
      role?: MemberRole
      display_name?: string
      status?: MemberStatus
    }) => {
      const { error } = await supabase.rpc('update_operator', {
        p_business_id: business!.id,
        p_member_id: input.memberId,
        p_display_name: input.display_name ?? null,
        p_role: input.role ?? null,
        p_status: input.status ?? null,
      })
      if (error) {
        console.error('[update_operator] failed', { input, error })
        throw error
      }
    },
    onSuccess: () => invalidateOperatorQueries(qc, business?.id),
  })
}

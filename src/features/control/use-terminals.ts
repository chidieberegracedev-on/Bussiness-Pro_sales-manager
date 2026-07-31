import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
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
  /** Null for PIN-only operators, who have no Supabase account. */
  user_id: string | null
  display_name: string
  role: MemberRole
  status: string
  has_pin: boolean
  pin_locked_until: string | null
  created_at: string
}

export function useEmployees() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['employees', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_members')
        .select(
          'id, user_id, role, status, display_name, created_at, profiles(full_name), employee_pins(member_id, locked_until)',
        )
        .eq('business_id', business!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      type Raw = {
        id: string
        user_id: string | null
        role: MemberRole
        status: string
        display_name: string | null
        created_at: string
        profiles: { full_name: string | null } | null
        employee_pins: { member_id: string; locked_until: string | null }[] | null
      }
      return ((data ?? []) as unknown as Raw[]).map(
        (m): EmployeeRow => ({
          member_id: m.id,
          user_id: m.user_id,
          // A PIN-only operator has no profile, so display_name is the name.
          display_name: m.display_name ?? m.profiles?.full_name ?? 'Unnamed',
          role: m.role,
          status: m.status,
          has_pin: (m.employee_pins?.length ?? 0) > 0,
          pin_locked_until: m.employee_pins?.[0]?.locked_until ?? null,
          created_at: m.created_at,
        }),
      )
    },
    enabled: !!business,
  })
}

export function useSetEmployeePin() {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { memberId: string; pin: string }) => {
      const { error } = await supabase.rpc('set_employee_pin', {
        p_business_id: business!.id,
        p_member_id: input.memberId,
        p_pin: input.pin,
      })
      if (error) {
        console.error('[set_employee_pin] failed', error)
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees', business?.id] })
      qc.invalidateQueries({ queryKey: ['terminal-employees', business?.id] })
      qc.invalidateQueries({ queryKey: ['approvers', business?.id] })
    },
  })
}

function invalidateOperatorQueries(qc: ReturnType<typeof useQueryClient>, businessId: string | undefined) {
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

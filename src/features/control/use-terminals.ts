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
  user_id: string
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
        user_id: string
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
      const { memberId, ...patch } = input
      const { error } = await supabase
        .from('business_members')
        .update(patch)
        .eq('id', memberId)
        .eq('business_id', business!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees', business?.id] })
      qc.invalidateQueries({ queryKey: ['terminal-employees', business?.id] })
      qc.invalidateQueries({ queryKey: ['memberships'] })
    },
  })
}

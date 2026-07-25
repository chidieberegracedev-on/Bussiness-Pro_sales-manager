import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/features/auth/store'
import { useBusinessStore } from '@/features/business/store'
import type { MemberRole } from '@/types/database'

export interface Membership {
  id: string
  role: MemberRole
  status: string
  business: {
    id: string
    name: string
    currency_code: string
    currency_exponent: number
    timezone: string
    country_code: string | null
    logo_path: string | null
    is_active: boolean
  }
}

export function useMyMemberships() {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    queryKey: ['memberships', userId],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('business_members')
        .select(
          'id, role, status, business:businesses(id, name, currency_code, currency_exponent, timezone, country_code, logo_path, is_active)',
        )
        .eq('user_id', userId!)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as Membership[]
    },
    enabled: !!userId,
  })
}

/**
 * Resolves the active business + the current user's role in it.
 * Guard logic (AC-1.3/1.5) lives in the route guards, which read this.
 */
export function useActiveBusiness() {
  const { data: memberships, isLoading, isError } = useMyMemberships()
  const activeBusinessId = useBusinessStore((s) => s.activeBusinessId)

  const membership = useMemo(() => {
    if (!memberships) return undefined
    if (activeBusinessId) {
      const found = memberships.find((m) => m.business.id === activeBusinessId)
      if (found) return found
    }
    return memberships.length === 1 ? memberships[0] : undefined
  }, [memberships, activeBusinessId])

  return {
    memberships,
    membership,
    business: membership?.business,
    role: membership?.role,
    isLoading,
    isError,
  }
}

/**
 * V1 has exactly one location per business (DATA_MODEL.md §9) — this is the
 * one every stock movement and sale is written against.
 */
export function useDefaultLocation() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['default-location', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('business_id', business!.id)
        .eq('is_default', true)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!business,
  })
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/features/auth/store'
import { useBusinessStore } from '@/features/business/store'
import type { MemberRole, OperatorMode } from '@/types/database'

export interface Membership {
  id: string
  role: MemberRole
  status: string
  display_name: string | null
  business: {
    id: string
    name: string
    currency_code: string
    currency_exponent: number
    timezone: string
    country_code: string | null
    logo_path: string | null
    is_active: boolean
    /** Undefined only on a database where 0018 hasn't been applied yet. */
    operator_mode?: OperatorMode
  }
}

export function useMyMemberships() {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    queryKey: ['memberships', userId],
    queryFn: async (): Promise<Membership[]> => {
      const BUSINESS = 'id, name, currency_code, currency_exponent, timezone, country_code, logo_path, is_active'

      async function load(businessColumns: string) {
        return supabase
          .from('business_members')
          .select(`id, role, status, display_name, business:businesses(${businessColumns})`)
          .eq('user_id', userId!)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
      }

      let { data, error } = await load(`${BUSINESS}, operator_mode`)

      // 42703 = undefined_column. This query is the root of the whole app: if
      // 0018 hasn't been applied yet, asking for operator_mode would fail it
      // outright and sign everybody out of their own business. Fall back to the
      // pre-0018 shape instead — the mode then reads as single_owner, which is
      // the correct default for a database that has never heard of it.
      if (error?.code === '42703') {
        console.warn('[memberships] operator_mode column missing — apply migration 0018')
        ;({ data, error } = await load(BUSINESS))
      }

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

  const operatorMode = membership?.business.operator_mode

  return {
    memberships,
    membership,
    business: membership?.business,
    role: membership?.role,
    operatorMode,
    /**
     * The one flag the whole PIN/operator/terminal/shift layer hangs off.
     *
     * Defaults to FALSE while the business is still loading and for any row
     * that predates 0018 — a missing mode must read as "just let them work",
     * never as "put a lock screen in front of them".
     */
    isMultiOperator: operatorMode === 'multi_operator',
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

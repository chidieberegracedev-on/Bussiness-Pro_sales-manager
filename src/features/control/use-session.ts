import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import {
  useEmployeeSessionStore,
  getTerminalId,
  readToken,
} from '@/features/control/session-store'
import type { MemberRole, SessionContext } from '@/types/database'

export interface EmployeeOption {
  member_id: string
  display_name: string
  role: MemberRole
  has_pin: boolean
  locked_until: string | null
}

/**
 * The employees who can unlock this terminal. Names only — PIN hashes are not
 * selectable by any client (BR-C1.5), so "has_pin" is derived from a count
 * rather than reading the hash.
 */
export function useTerminalEmployees() {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['terminal-employees', business?.id],
    queryFn: async () => {
      // v_operators exposes has_pin as a boolean; employee_pins itself is
      // unreadable by design, so querying it directly always reads as "no PIN".
      const { data, error } = await supabase
        .from('v_operators')
        .select('member_id, role, display_name, has_pin, locked_until')
        .eq('business_id', business!.id)
        .eq('status', 'active')
      if (error) throw error
      type Raw = {
        member_id: string
        role: MemberRole
        display_name: string | null
        has_pin: boolean
        locked_until: string | null
      }
      return ((data ?? []) as Raw[]).map(
        (m): EmployeeOption => ({
          member_id: m.member_id,
          display_name: m.display_name ?? 'Unnamed',
          role: m.role,
          has_pin: m.has_pin,
          locked_until: m.locked_until,
        }),
      )
    },
    enabled: !!business,
  })
}

/**
 * Restores the session context from a stored token on mount, so a refresh does
 * not eject the operator. The context is always re-resolved server-side — the
 * client never reconstructs its own identity (BR-C1.4).
 */
export function useRestoreSession() {
  const token = useEmployeeSessionStore((s) => s.token)
  const context = useEmployeeSessionStore((s) => s.context)
  const setContext = useEmployeeSessionStore((s) => s.setContext)
  const clear = useEmployeeSessionStore((s) => s.clear)
  const markRestored = useEmployeeSessionStore((s) => s.markRestored)

  useEffect(() => {
    if (!token) {
      markRestored()
      return
    }
    if (context) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('session_context', { p_token: token })
      if (cancelled) return
      if (error || !data) {
        // Token is stale or the session was ended elsewhere.
        clear()
        return
      }
      setContext(data as unknown as SessionContext)
      markRestored()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
}

export function usePinUnlock() {
  const { business } = useActiveBusiness()
  const setSession = useEmployeeSessionStore((s) => s.setSession)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { memberId: string; pin: string }) => {
      const terminalId = getTerminalId()
      if (!terminalId) {
        throw new Error('This device is not registered as a terminal yet.')
      }
      const { data, error } = await supabase.rpc('pin_unlock', {
        p_business_id: business!.id,
        p_member_id: input.memberId,
        p_terminal_id: terminalId,
        p_pin: input.pin,
      })
      if (error) {
        console.error('[pin_unlock] failed', { memberId: input.memberId, error })
        throw error
      }
      const unlocked = data as unknown as { token: string; member_id: string; role: MemberRole }

      // Resolve the full context server-side rather than assembling it here.
      const { data: ctx, error: ctxError } = await supabase.rpc('session_context', {
        p_token: unlocked.token,
      })
      if (ctxError || !ctx) throw ctxError ?? new Error('Could not load the session.')
      return { token: unlocked.token, context: ctx as unknown as SessionContext }
    },
    onSuccess: ({ token, context }) => {
      setSession(token, context)
      qc.invalidateQueries({ queryKey: ['open-shift'] })
      qc.invalidateQueries({ queryKey: ['held-baskets'] })
    },
  })
}

export function useResumeSession() {
  const setSession = useEmployeeSessionStore((s) => s.setSession)

  return useMutation({
    mutationFn: async (pin: string) => {
      const token = readToken()
      if (!token) throw new Error('No session to resume.')
      const { data, error } = await supabase.rpc('pin_resume_session', {
        p_token: token,
        p_pin: pin,
      })
      if (error) {
        console.error('[pin_resume_session] failed', error)
        throw error
      }
      return { token, context: data as unknown as SessionContext }
    },
    onSuccess: ({ token, context }) => setSession(token, context),
  })
}

export function useLockSession() {
  const setLocked = useEmployeeSessionStore((s) => s.setLocked)

  return useMutation({
    mutationFn: async () => {
      const token = readToken()
      if (!token) return
      const { error } = await supabase.rpc('pin_lock_session', { p_token: token })
      if (error) throw error
    },
    onSuccess: () => setLocked(),
  })
}

export function useEndSession() {
  const clear = useEmployeeSessionStore((s) => s.clear)

  return useMutation({
    mutationFn: async () => {
      const token = readToken()
      if (!token) return
      const { error } = await supabase.rpc('end_session', { p_token: token })
      if (error) throw error
    },
    onSettled: () => clear(),
  })
}

const AUTO_LOCK_MS = 90_000

/**
 * Locks the screen after 90 seconds of inactivity. The basket is untouched —
 * re-entering the PIN resumes the same session row (BR-C1.7).
 */
export function useAutoLock(enabled: boolean) {
  const lock = useLockSession()
  const status = useEmployeeSessionStore((s) => s.context?.status)

  useEffect(() => {
    if (!enabled || status !== 'active') return
    let timer: ReturnType<typeof setTimeout>

    function schedule() {
      clearTimeout(timer)
      timer = setTimeout(() => lock.mutate(), AUTO_LOCK_MS)
    }

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const event of events) window.addEventListener(event, schedule, { passive: true })
    schedule()

    return () => {
      clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, schedule)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status])
}

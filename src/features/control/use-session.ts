import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'
import { useProfile } from '@/features/auth/use-profile'
import {
  useEmployeeSessionStore,
  getTerminalId,
  readToken,
} from '@/features/control/session-store'
import type { MemberRole, PinUnlockResult, SessionContext } from '@/types/database'

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
  const { business, membership } = useActiveBusiness()
  const { data: profile } = useProfile()
  const myName = membership?.display_name ?? profile?.full_name ?? null

  return useQuery({
    queryKey: ['terminal-employees', business?.id, membership?.id, myName],
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
          // The account holder's row may have no display_name (pre-0018). Their
          // own name is right here — don't put "Unnamed" on the sign-in list.
          display_name:
            m.display_name ?? (m.member_id === membership?.id ? myName : null) ?? 'Unnamed',
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
        // Token is stale or the session was ended elsewhere — expected on a
        // normal sign-out, so this is information rather than a failure.
        if (error) console.error('[session_context] failed', error)
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

/**
 * A failed PIN is a RESULT, not an exception.
 *
 * 0026 had to make that change to fix the lockout: the old RPC incremented
 * failed_count then raised, and the raise rolled the increment back, so the
 * counter never moved and the promised 5-attempt lockout never once fired. A
 * write can't survive a raise in the same transaction — so failure returns,
 * and this throws a typed error the UI can read attempts_remaining off.
 */
export type PinFailure = Extract<PinUnlockResult, { ok: false }>

export class PinError extends Error {
  readonly result: PinFailure
  /** toReadableError passes this message through verbatim — see lib/errors. */
  readonly userFacing = true

  constructor(result: PinFailure, message: string) {
    super(message)
    this.name = 'PinError'
    this.result = result
  }
}

export function pinErrorMessage(result: PinFailure): string {
  switch (result.reason) {
    case 'incorrect': {
      const left = result.attempts_remaining
      if (left === undefined) return 'That PIN is not correct.'
      if (left === 0) return 'That PIN is not correct. This operator is now locked out.'
      return `That PIN is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left before a 15-minute lockout.`
    }
    case 'locked':
      return 'Too many wrong PINs. Try again in 15 minutes, or ask an owner to reset it.'
    case 'no_pin':
      return 'No PIN has been set for this operator yet.'
    case 'no_session':
      return 'That session has ended. Choose your name to sign in again.'
    case 'device_not_authenticated':
      return 'This device is not signed in to the business.'
    default:
      return 'Could not sign in.'
  }
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

      const result = data as unknown as PinUnlockResult
      if (!result.ok) {
        // Not an exception on the server — the failed attempt had to commit for
        // the lockout counter to work. Surfaced as one here so the caller's
        // onError path is unchanged.
        throw new PinError(result, pinErrorMessage(result))
      }

      // Resolve the full context server-side rather than assembling it here.
      const { data: ctx, error: ctxError } = await supabase.rpc('session_context', {
        p_token: result.token,
      })
      if (ctxError || !ctx) {
        console.error('[session_context] failed after unlock', ctxError)
        throw ctxError ?? new Error('Could not load the session.')
      }
      return { token: result.token, context: ctx as unknown as SessionContext }
    },
    onSuccess: ({ token, context }) => {
      setSession(token, context)
      qc.invalidateQueries({ queryKey: ['open-shift'] })
      qc.invalidateQueries({ queryKey: ['held-baskets'] })
    },
  })
}

/**
 * Re-entry after a lock.
 *
 * Uses unlock_session, not pin_unlock: the operator is already bound to the
 * locked session, so re-validating their PIN should reactivate THAT session.
 * pin_unlock always mints a new one, which is why the lock screen used to
 * force the operator to go back and re-pick their name — and why a held
 * basket attached to the old session went with it.
 */
export function useResumeSession() {
  const setSession = useEmployeeSessionStore((s) => s.setSession)

  return useMutation({
    mutationFn: async (pin: string) => {
      const token = readToken()
      if (!token) throw new Error('No session to resume.')

      const { data, error } = await supabase.rpc('unlock_session', {
        p_token: token,
        p_pin: pin,
      })
      if (error) {
        console.error('[unlock_session] failed', error)
        throw error
      }

      const result = data as unknown as PinUnlockResult
      if (!result.ok) throw new PinError(result, pinErrorMessage(result))

      const { data: ctx, error: ctxError } = await supabase.rpc('session_context', {
        p_token: result.token,
      })
      if (ctxError || !ctx) {
        console.error('[session_context] failed after unlock_session', ctxError)
        throw ctxError ?? new Error('Could not load the session.')
      }
      return { token: result.token, context: ctx as unknown as SessionContext }
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
      if (error) {
        console.error('[pin_lock_session] failed', error)
        throw error
      }
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
      if (error) {
        console.error('[end_session] failed', error)
        throw error
      }
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

import { create } from 'zustand'
import type { SessionContext } from '@/types/database'

// The token is a bearer secret. It lives in memory for normal use, with a copy
// in sessionStorage so a page refresh does not throw the cashier back to the
// PIN pad mid-basket. sessionStorage (not localStorage) so closing the tab ends
// the operator's presence on that device.
const TOKEN_KEY = 'bp-employee-token'
const TERMINAL_KEY = 'bp-terminal-id'

interface EmployeeSessionState {
  token: string | null
  context: SessionContext | null
  /** True once we have attempted to restore a token from storage. */
  restored: boolean

  setSession: (token: string, context: SessionContext) => void
  setContext: (context: SessionContext) => void
  setLocked: () => void
  clear: () => void
  markRestored: () => void
}

export const useEmployeeSessionStore = create<EmployeeSessionState>((set) => ({
  token: sessionStorage.getItem(TOKEN_KEY),
  context: null,
  restored: false,

  setSession: (token, context) => {
    sessionStorage.setItem(TOKEN_KEY, token)
    set({ token, context, restored: true })
  },
  setContext: (context) => set({ context }),
  setLocked: () =>
    set((s) => (s.context ? { context: { ...s.context, status: 'locked' } } : {})),
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY)
    set({ token: null, context: null, restored: true })
  },
  markRestored: () => set({ restored: true }),
}))

/** The registered terminal this browser is acting as. */
export function getTerminalId(): string | null {
  return localStorage.getItem(TERMINAL_KEY)
}

export function setTerminalId(id: string | null) {
  if (id) localStorage.setItem(TERMINAL_KEY, id)
  else localStorage.removeItem(TERMINAL_KEY)
}

/**
 * Read the token without subscribing — for use inside mutation functions that
 * must not re-render on session changes.
 */
export function readToken(): string | null {
  return useEmployeeSessionStore.getState().token
}

export function readSessionContext(): SessionContext | null {
  return useEmployeeSessionStore.getState().context
}

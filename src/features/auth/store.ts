import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  user: User | null
  /** True until the initial session check resolves. */
  initializing: boolean
  setSession: (session: Session | null) => void
  setInitializing: (value: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initializing: true,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setInitializing: (value) => set({ initializing: value }),
}))

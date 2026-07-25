import { useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/features/auth/store'
import { useBusinessStore } from '@/features/business/store'
import { useCartStore } from '@/features/pos/cart-store'
import { queryClient } from '@/app/providers'

export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession)
  const setInitializing = useAuthStore((s) => s.setInitializing)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setInitializing(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setInitializing(false)

      // AC-1.6 / AC-1.8: sign-out must clear session and ALL cached business data.
      if (event === 'SIGNED_OUT') {
        useBusinessStore.getState().clearActiveBusiness()
        useCartStore.getState().reset()
        queryClient.clear()
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [setSession, setInitializing])

  return children
}

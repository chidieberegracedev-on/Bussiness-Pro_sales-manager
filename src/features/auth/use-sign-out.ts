import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useBusinessStore } from '@/features/business/store'
import { useCartStore } from '@/features/pos/cart-store'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useWorkspaceModeStore } from '@/features/control/workspace-router'
import { toast } from '@/hooks/use-toast'

/**
 * Signing out of the business account.
 *
 * Lives here rather than in the user menu because the user menu only exists
 * inside the app shell — and the two screens where a person is most likely to
 * be stuck (onboarding, choose-a-business) render outside it. Anywhere that
 * can strand someone needs the same exit, and it has to tear down the same
 * state, or the next sign-in inherits the last account's cache.
 */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useCallback(async () => {
    // AC-1.8: sign-out clears session and all cached business data.
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast({ variant: 'destructive', title: "Couldn't sign out", description: error.message })
      return
    }
    useBusinessStore.getState().clearActiveBusiness()
    useCartStore.getState().reset()
    // The operator session lives on top of the business session — dropping the
    // business must drop the operator with it.
    useEmployeeSessionStore.getState().clear()
    useWorkspaceModeStore.getState().setOwnerAdmin(false)
    queryClient.clear()
    navigate('/sign-in', { replace: true })
  }, [navigate, queryClient])
}

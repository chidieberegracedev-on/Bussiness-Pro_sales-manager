import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, Settings, User, UserRound, Repeat } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/features/auth/store'
import { useProfile } from '@/features/auth/use-profile'
import { useBusinessStore } from '@/features/business/store'
import { useCartStore } from '@/features/pos/cart-store'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useEndSession } from '@/features/control/use-session'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

function initials(name: string | null | undefined, email: string | undefined) {
  const source = name?.trim() || email || '?'
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function UserMenu() {
  const user = useAuthStore((s) => s.user)
  const { data: profile } = useProfile()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const sessionContext = useEmployeeSessionStore((s) => s.context)
  const endSession = useEndSession()

  /**
   * Ends the OPERATOR session only. The business stays signed in to Supabase —
   * one business login, many operator sessions on top of it.
   */
  function handleSwitchOperator() {
    useCartStore.getState().reset()
    endSession.mutate()
  }

  async function handleSignOut() {
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
    queryClient.clear()
    navigate('/sign-in', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 px-2">
          <Avatar className="size-8">
            <AvatarFallback>{initials(profile?.full_name, user?.email)}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="truncate text-sm font-medium leading-tight">{profile?.full_name || 'Account'}</span>
            <span className="truncate text-xs leading-tight text-text-muted">{user?.email}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {sessionContext?.status === 'active' ? (
          <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-2">
              <UserRound className="size-4" /> {sessionContext.display_name ?? 'Operator'}
            </span>
            <span className="pl-6 text-xs font-normal text-text-muted">
              Operator · {user?.email}
            </span>
          </DropdownMenuLabel>
        ) : (
          <DropdownMenuLabel className="flex items-center gap-2">
            <User className="size-4" /> {user?.email}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings/appearance')}>
          <Settings className="size-4" /> Appearance
        </DropdownMenuItem>
        {sessionContext?.status === 'active' && (
          <DropdownMenuItem onSelect={handleSwitchOperator}>
            <Repeat className="size-4" /> Switch operator
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
          <LogOut className="size-4" /> Sign out of business
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

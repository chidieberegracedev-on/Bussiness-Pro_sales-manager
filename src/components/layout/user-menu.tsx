import { useNavigate } from 'react-router-dom'
import { LogOut, Settings, User, UserRound, Repeat } from 'lucide-react'
import { useAuthStore } from '@/features/auth/store'
import { useProfile } from '@/features/auth/use-profile'
import { useSignOut } from '@/features/auth/use-sign-out'
import { useCartStore } from '@/features/pos/cart-store'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useEndSession } from '@/features/control/use-session'
import { useWorkspaceModeStore } from '@/features/control/workspace-router'
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
  const handleSignOut = useSignOut()
  const navigate = useNavigate()
  const sessionContext = useEmployeeSessionStore((s) => s.context)
  const endSession = useEndSession()
  const ownerAdmin = useWorkspaceModeStore((s) => s.ownerAdmin)
  const setOwnerAdmin = useWorkspaceModeStore((s) => s.setOwnerAdmin)

  /**
   * Ends the OPERATOR session only. The business stays signed in to Supabase —
   * one business login, many operator sessions on top of it.
   */
  function handleSwitchOperator() {
    useCartStore.getState().reset()
    // Drop the admin bypass too, or the gate would send the owner straight back
    // into admin instead of the operator screen they just asked for.
    useWorkspaceModeStore.getState().setOwnerAdmin(false)
    endSession.mutate()
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
        {/* Administering a till device. The way back to the sign-in screen for
            whoever is about to work it. */}
        {sessionContext?.status !== 'active' && ownerAdmin && (
          <DropdownMenuItem onSelect={() => setOwnerAdmin(false)}>
            <Repeat className="size-4" /> Back to operator sign-in
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

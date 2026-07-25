import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown, Check, Building2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useActiveBusiness } from '@/features/business/hooks'
import { useBusinessStore } from '@/features/business/store'
import { useCartStore } from '@/features/pos/cart-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function BusinessSwitcher() {
  const { memberships, business } = useActiveBusiness()
  const setActiveBusiness = useBusinessStore((s) => s.setActiveBusiness)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Only rendered when the user has 2+ businesses (WEB_IMPLEMENTATION.md §7).
  if (!memberships || memberships.length < 2) return null

  function handleSwitch(businessId: string) {
    if (businessId === business?.id) return
    // AC-1.6: switching business fully clears the previous business's cached data.
    queryClient.clear()
    useCartStore.getState().reset()
    setActiveBusiness(businessId)
    navigate('/products')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between px-3"
          aria-label={`Switch business, currently ${business?.name ?? 'none selected'}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0 text-text-muted" />
            <span className="truncate">{business?.name ?? 'Select business'}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your businesses</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.business.id}
            onSelect={() => handleSwitch(m.business.id)}
            className="gap-2"
          >
            <Check className={cn('size-4', m.business.id === business?.id ? 'opacity-100' : 'opacity-0')} />
            <span className="flex-1 truncate">{m.business.name}</span>
            <span className="text-xs capitalize text-text-muted">{m.role}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

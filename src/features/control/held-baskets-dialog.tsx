import { useState } from 'react'
import { Search, PlayCircle, Trash2, ArrowRightLeft, PauseCircle, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { Money } from '@/components/money/money'
import {
  useHeldBaskets,
  useResumeBasket,
  useTransferBasket,
  useDiscardBasket,
  deserialize,
} from '@/features/control/use-held-baskets'
import { useCartStore } from '@/features/pos/cart-store'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

export function HeldBasketsDialog({ onClose }: { onClose: () => void }) {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const context = useEmployeeSessionStore((s) => s.context)
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 200)

  const { data: baskets, isLoading } = useHeldBaskets(debounced)
  const resume = useResumeBasket()
  const transfer = useTransferBasket()
  const discard = useDiscardBasket()
  const setLines = useCartStore((s) => s.setLines)
  const currentLines = useCartStore((s) => s.lines)

  async function handleResume(basketId: string, basket: unknown) {
    if (currentLines.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Finish or hold the current basket first',
        description: 'Resuming would replace what is on screen.',
      })
      return
    }
    try {
      await resume.mutateAsync(basketId)
      setLines(deserialize(basket))
      toast({ title: 'Basket resumed' })
      onClose()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't resume basket",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Held baskets</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search held baskets…"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            )}

            {!isLoading && (!baskets || baskets.length === 0) && (
              <EmptyState
                icon={PauseCircle}
                title="Nothing on hold"
                description="Park a basket with Hold to serve another customer, then pick it up here — from any terminal."
              />
            )}

            {!isLoading && baskets && baskets.length > 0 && (
              <ul className="space-y-2">
                {baskets.map((basket) => {
                  const onThisTerminal = basket.terminal_id === context?.terminal_id
                  return (
                    <li
                      key={basket.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                        <PauseCircle className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {basket.label ?? `${basket.item_count} items`}
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {business && formatDateTime(basket.created_at, business.timezone, locale)}
                          {!onThisTerminal && ' · held on another terminal'}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-text-primary">
                        <Money value={basket.total} />
                      </span>
                      {!onThisTerminal && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => transfer.mutate(basket.id)}
                          disabled={transfer.isPending}
                          aria-label="Bring to this terminal"
                        >
                          <ArrowRightLeft className="size-3.5" /> Bring here
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleResume(basket.id, basket.basket)}
                        disabled={resume.isPending}
                      >
                        {resume.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <PlayCircle className="size-3.5" />
                        )}
                        Resume
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => discard.mutate(basket.id)}
                        disabled={discard.isPending}
                        aria-label="Discard held basket"
                      >
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

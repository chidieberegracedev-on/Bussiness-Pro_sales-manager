import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { IconBadge } from '@/components/ui/icon-badge'
import { useStartThread } from '@/features/network/use-network'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * The first message.
 *
 * Deliberately a separate step from Connect. Connecting mints a private
 * supplier record — a commitment to buy from someone. Asking "do you deliver
 * to X, and what's your lead time on 200?" is not, and forcing the commitment
 * first is why a buyer would abandon the screen instead.
 */
export function MessageSupplierDialog({
  supplierProfileId,
  supplierName,
  listingId,
  listingTitle,
  onClose,
}: {
  supplierProfileId: string
  supplierName: string
  listingId?: string | null
  listingTitle?: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const start = useStartThread()
  const [body, setBody] = useState(
    listingTitle ? `Hello — I'm interested in ${listingTitle}. ` : '',
  )

  function send() {
    if (!body.trim()) return
    start.mutate(
      { supplierProfileId, body, listingId: listingId ?? null },
      {
        onSuccess: (thread) => {
          onClose()
          navigate(`/network/messages/${thread.id}`)
        },
        onError: (e) =>
          toast({
            variant: 'destructive',
            title: "Couldn't send that message",
            description: toReadableError(e),
          }),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconBadge tone="accent" size="lg">
              <MessageSquare />
            </IconBadge>
            <div className="min-w-0">
              <DialogTitle className="truncate">Message {supplierName}</DialogTitle>
              <DialogDescription>
                {listingTitle ? `About ${listingTitle}` : 'About their storefront'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Textarea
          autoFocus
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="Ask about lead time, delivery, packing, or a price at your quantity."
          aria-label="Your message"
        />

        {/* Say exactly what crosses the boundary. A supplier seeing a business
            name they don't recognise is the whole point of the disclosure, and
            a buyer deserves to know it happens before they press send. */}
        <p className="text-xs text-text-muted">
          They'll see this message and your business name
          {business?.name ? ` (${business.name})` : ''}. Nothing else about your business is shared
          — not your prices, your stock, or your other suppliers.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!body.trim() || start.isPending}>
            {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

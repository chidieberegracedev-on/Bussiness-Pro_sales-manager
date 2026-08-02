import { useState } from 'react'
import { Tag, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useEnqueuePrintJob } from '@/features/print/print-queue'
import type { LabelPayload } from '@/features/print/renderers'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

export interface LabelSuggestion {
  productName: string
  variantName?: string | null
  price?: string | null
  code?: string | null
  sku?: string | null
  /** How many arrived — the default number of labels to print. */
  quantity: number
}

/**
 * Event-driven label automation.
 *
 * The point isn't a print button; it's that a business event ASKS. Goods
 * arrive → "95 received. Queue 95 labels?". The events already exist, so this
 * costs a prompt and turns printing from a chore someone remembers into
 * something the system offers at the only moment it's useful.
 *
 * It always asks. Silently queueing 95 labels because a delivery landed is how
 * you burn a roll of label stock.
 */
export function LabelSuggestionDialog({
  title,
  description,
  suggestions,
  onClose,
}: {
  title: string
  description: string
  suggestions: LabelSuggestion[]
  onClose: () => void
}) {
  const enqueue = useEnqueuePrintJob()
  const [counts, setCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(suggestions.map((s, i) => [i, String(s.quantity)])),
  )

  const total = Object.values(counts).reduce((sum, v) => sum + (Number(v) || 0), 0)

  async function queue() {
    const labels: LabelPayload[] = []
    suggestions.forEach((s, i) => {
      const n = Math.min(Number(counts[i]) || 0, 500)
      for (let k = 0; k < n; k += 1) {
        labels.push({
          productName: s.productName,
          variantName: s.variantName ?? null,
          price: s.price ?? null,
          code: s.code ?? s.sku ?? null,
          sku: s.sku ?? null,
        })
      }
    })
    if (labels.length === 0) {
      onClose()
      return
    }
    try {
      await enqueue.mutateAsync({
        jobType: 'product_label',
        payload: { labels, medium: 'label-50x25' },
        copies: 1,
      })
      toast({
        title: `${labels.length} label${labels.length === 1 ? '' : 's'} queued`,
        description: 'Print them from Settings › Printing.',
      })
      onClose()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't queue labels",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{description}</p>

          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li
                key={`${s.productName}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {s.productName}
                    {s.variantName && ` · ${s.variantName}`}
                  </p>
                  <p className="text-xs text-text-muted">
                    {s.code ?? s.sku ?? 'No barcode — the label will show the name only'}
                  </p>
                </div>
                <Input
                  value={counts[i] ?? ''}
                  onChange={(e) =>
                    setCounts((prev) => ({ ...prev, [i]: e.target.value.replace(/[^\d]/g, '') }))
                  }
                  inputMode="numeric"
                  aria-label={`Labels for ${s.productName}`}
                  className="h-9 w-20 text-right"
                />
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-text-secondary">
              {total} label{total === 1 ? '' : 's'} total
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                <X className="size-4" /> Not now
              </Button>
              <Button onClick={queue} disabled={total === 0 || enqueue.isPending}>
                <Printer className="size-4" /> Queue labels
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

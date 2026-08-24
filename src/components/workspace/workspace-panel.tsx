import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A right-hand slide-over.
 *
 * The secondary POS tools (shift, held orders, cash, history, profile) all
 * open into this rather than onto the selling surface. A drawer rather than a
 * modal because the cart stays visible behind it — a cashier checking a held
 * order has not stopped serving the person in front of them.
 */
export function WorkspacePanel({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  // Escape closes. On a till the keyboard is right there and reaching for a
  // small X with a queue waiting is the wrong ask.
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 bg-text-primary/25 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 flex h-full w-full max-w-md flex-col bg-surface shadow-e3',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="type-title">{title}</h2>
            {description && <p className="type-meta mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-icon transition-colors hover:bg-background hover:text-text-primary"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && <div className="shrink-0 border-t border-border p-5">{footer}</div>}
      </div>
    </div>
  )
}

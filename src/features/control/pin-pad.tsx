import { useEffect, useState } from 'react'
import { Delete, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * A 4-digit PIN entry pad. Submits automatically on the fourth digit so the
 * cashier never has to reach for a confirm button.
 */
export function PinPad({
  onSubmit,
  submitting,
  error,
  onClearError,
  autoFocusKeyboard = true,
}: {
  onSubmit: (pin: string) => void
  submitting?: boolean
  error?: string | null
  onClearError?: () => void
  autoFocusKeyboard?: boolean
}) {
  const [pin, setPin] = useState('')

  function push(digit: string) {
    if (submitting) return
    onClearError?.()
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + digit
      if (next.length === 4) {
        // Defer so the fourth dot paints before the request starts.
        setTimeout(() => onSubmit(next), 0)
      }
      return next
    })
  }

  function backspace() {
    if (submitting) return
    onClearError?.()
    setPin((prev) => prev.slice(0, -1))
  }

  // Clear the entry after a failure so the next attempt starts clean.
  useEffect(() => {
    if (error) setPin('')
  }, [error])

  // Physical keyboards are common at a counter — support them.
  useEffect(() => {
    if (!autoFocusKeyboard) return
    function onKey(event: KeyboardEvent) {
      if (event.key >= '0' && event.key <= '9') push(event.key)
      else if (event.key === 'Backspace') backspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, autoFocusKeyboard])

  return (
    <div className="w-full max-w-64">
      <div className="mb-5 flex justify-center gap-3" aria-label={`${pin.length} of 4 digits entered`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'size-3.5 rounded-full border-2 transition-colors',
              error
                ? 'border-danger'
                : i < pin.length
                  ? 'border-accent-primary bg-accent-primary'
                  : 'border-border-strong',
            )}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-center text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => push(digit)}
            disabled={submitting}
            className="rounded-xl border border-border bg-card py-4 text-xl font-semibold tabular-nums text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => push('0')}
          disabled={submitting}
          className="rounded-xl border border-border bg-card py-4 text-xl font-semibold tabular-nums text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={submitting}
          aria-label="Delete last digit"
          className="flex items-center justify-center rounded-xl border border-border bg-surface-muted text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <Delete className="size-5" />}
        </button>
      </div>
    </div>
  )
}

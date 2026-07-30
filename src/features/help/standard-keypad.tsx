import { useState } from 'react'
import { Delete } from 'lucide-react'
import { evaluateExpression, formatResult } from '@/features/help/calculator-math'
import { cn } from '@/lib/utils'

const KEYS: { label: string; kind: 'digit' | 'op' | 'action'; value?: string }[] = [
  { label: 'C', kind: 'action' },
  { label: '(', kind: 'op', value: '(' },
  { label: ')', kind: 'op', value: ')' },
  { label: '÷', kind: 'op', value: '÷' },
  { label: '7', kind: 'digit' },
  { label: '8', kind: 'digit' },
  { label: '9', kind: 'digit' },
  { label: '×', kind: 'op', value: '×' },
  { label: '4', kind: 'digit' },
  { label: '5', kind: 'digit' },
  { label: '6', kind: 'digit' },
  { label: '−', kind: 'op', value: '−' },
  { label: '1', kind: 'digit' },
  { label: '2', kind: 'digit' },
  { label: '3', kind: 'digit' },
  { label: '+', kind: 'op', value: '+' },
  { label: '0', kind: 'digit' },
  { label: '.', kind: 'digit' },
]

export function StandardKeypad({
  onEvaluated,
  compact,
}: {
  onEvaluated?: (expression: string, result: string) => void
  compact?: boolean
}) {
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const livePreview = expression ? evaluateExpression(expression) : null

  function press(key: (typeof KEYS)[number]) {
    setError(false)
    if (key.kind === 'action') {
      setExpression('')
      setResult(null)
      return
    }
    setExpression((prev) => prev + (key.value ?? key.label))
    setResult(null)
  }

  function backspace() {
    setError(false)
    setExpression((prev) => prev.slice(0, -1))
    setResult(null)
  }

  function equals() {
    const value = evaluateExpression(expression)
    if (value === null) {
      setError(true)
      return
    }
    const formatted = formatResult(value)
    setResult(formatted)
    onEvaluated?.(expression, formatted)
    setExpression(formatted)
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-right',
          compact ? 'min-h-16' : 'min-h-20',
        )}
      >
        <p
          className={cn(
            'break-all font-mono tabular-nums text-text-primary',
            compact ? 'text-lg' : 'text-2xl',
          )}
        >
          {expression || '0'}
        </p>
        {error ? (
          <p className="mt-0.5 text-xs font-medium text-danger">That expression isn't valid</p>
        ) : result !== null ? (
          <p className="mt-0.5 text-xs text-success">= {result}</p>
        ) : livePreview !== null && expression !== formatResult(livePreview) ? (
          <p className="mt-0.5 text-xs text-text-muted">= {formatResult(livePreview)}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            onClick={() => press(key)}
            className={cn(
              'rounded-lg border font-medium tabular-nums transition-colors',
              compact ? 'py-2 text-sm' : 'py-2.5',
              key.kind === 'op'
                ? 'border-border bg-surface-muted text-accent-primary hover:bg-accent-primary/10'
                : key.kind === 'action'
                  ? 'border-danger/30 bg-danger/5 text-danger hover:bg-danger/10'
                  : 'border-border bg-card text-text-primary hover:bg-surface-muted',
            )}
          >
            {key.label}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          aria-label="Backspace"
          className={cn(
            'flex items-center justify-center rounded-lg border border-border bg-surface-muted text-text-secondary transition-colors hover:bg-surface-muted/70',
            compact ? 'py-2' : 'py-2.5',
          )}
        >
          <Delete className="size-4" />
        </button>
        <button
          type="button"
          onClick={equals}
          className={cn(
            'rounded-lg bg-accent-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90',
            compact ? 'py-2 text-sm' : 'py-2.5',
          )}
        >
          =
        </button>
      </div>
    </div>
  )
}

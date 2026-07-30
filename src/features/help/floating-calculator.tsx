import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, X, Minus, GripHorizontal, Maximize2 } from 'lucide-react'
import { StandardKeypad } from '@/features/help/standard-keypad'
import { useSaveCalculation } from '@/features/help/use-calculator-history'
import { cn } from '@/lib/utils'

const POSITION_KEY = 'bp-calc-position'
const OPEN_KEY = 'bp-calc-open'
const PANEL_WIDTH = 264
const PANEL_HEIGHT = 380

interface Position {
  x: number
  y: number
}

function clampToViewport(pos: Position): Position {
  const maxX = Math.max(8, window.innerWidth - PANEL_WIDTH - 8)
  const maxY = Math.max(8, window.innerHeight - PANEL_HEIGHT - 8)
  return {
    x: Math.min(Math.max(8, pos.x), maxX),
    y: Math.min(Math.max(8, pos.y), maxY),
  }
}

function defaultPosition(): Position {
  // Bottom-right by default, per the spec.
  return clampToViewport({
    x: window.innerWidth - PANEL_WIDTH - 24,
    y: window.innerHeight - PANEL_HEIGHT - 24,
  })
}

function loadPosition(): Position {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) return defaultPosition()
    const parsed = JSON.parse(raw) as Position
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return defaultPosition()
    return clampToViewport(parsed)
  } catch {
    return defaultPosition()
  }
}

/**
 * A calculator available on every page: a launcher button that opens a small
 * draggable panel, remembering its last position across sessions.
 * Math is entirely client-side (WEB_IMPLEMENTATION §3).
 */
export function FloatingCalculator() {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) === 'true')
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState<Position>(() =>
    typeof window === 'undefined' ? { x: 24, y: 24 } : loadPosition(),
  )
  const dragState = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const saveCalculation = useSaveCalculation()

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, String(open))
  }, [open])

  useEffect(() => {
    function onResize() {
      setPosition((prev) => clampToViewport(prev))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!dragState.current) return
    setPosition(
      clampToViewport({
        x: event.clientX - dragState.current.offsetX,
        y: event.clientY - dragState.current.offsetY,
      }),
    )
  }, [])

  const onPointerUp = useCallback(() => {
    dragState.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    setPosition((prev) => {
      localStorage.setItem(POSITION_KEY, JSON.stringify(prev))
      return prev
    })
  }, [onPointerMove])

  function startDrag(event: React.PointerEvent) {
    dragState.current = {
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function handleEvaluated(expression: string, result: string) {
    // History persistence is best-effort — a signed-out or failing save must
    // never break the calculator.
    saveCalculation.mutate(
      { kind: 'standard', expression, result },
      { onError: () => undefined },
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open calculator"
        className="fixed bottom-5 right-5 z-30 flex size-12 items-center justify-center rounded-full bg-accent-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Calculator className="size-5" />
      </button>
    )
  }

  return (
    <div
      className="fixed z-40 rounded-xl border border-border bg-card shadow-xl"
      style={{ left: position.x, top: position.y, width: PANEL_WIDTH }}
    >
      <div
        onPointerDown={startDrag}
        className="flex cursor-grab touch-none items-center gap-2 rounded-t-xl border-b border-border bg-surface-muted/60 px-3 py-2 active:cursor-grabbing"
      >
        <GripHorizontal className="size-4 shrink-0 text-text-muted" />
        <span className="flex-1 select-none text-sm font-medium text-text-primary">Calculator</span>
        <Link
          to="/help/calculator"
          aria-label="Open full calculator"
          className="rounded p-0.5 text-text-muted transition-colors hover:text-text-primary"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Maximize2 className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? 'Expand calculator' : 'Minimize calculator'}
          className="rounded p-0.5 text-text-muted transition-colors hover:text-text-primary"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close calculator"
          className="rounded p-0.5 text-text-muted transition-colors hover:text-danger"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className={cn('p-3', minimized && 'hidden')}>
        <StandardKeypad compact onEvaluated={handleEvaluated} />
      </div>
    </div>
  )
}

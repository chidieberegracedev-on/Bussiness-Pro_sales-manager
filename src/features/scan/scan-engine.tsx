import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/** A raw capture, before resolution. Camera and wedge produce the same shape. */
export interface ScanEvent {
  code: string
  source: 'keyboard' | 'camera' | 'manual'
  at: number
}

type ScanHandler = (event: ScanEvent) => void

interface ScanEngineState {
  enabled: boolean
  setEnabled: (value: boolean) => void
  /** Most recent capture, for diagnostics. */
  last: ScanEvent | null
  handlers: Set<ScanHandler>
  emit: (event: ScanEvent) => void
}

export const useScanEngineStore = create<ScanEngineState>((set, get) => ({
  enabled: true,
  setEnabled: (value) => set({ enabled: value }),
  last: null,
  handlers: new Set(),
  emit: (event) => {
    set({ last: event })
    // Copied before iterating: a handler may unsubscribe itself on scan.
    for (const handler of [...get().handlers]) handler(event)
  },
}))

/**
 * Subscribe to scans. The LAST subscriber wins — screens mount their handler
 * and the most recently mounted one takes the scan, so a modal over the POS
 * captures instead of the basket behind it.
 *
 * Screens subscribe to codes; they never read keystrokes and never parse.
 */
export function useScanSubscription(handler: ScanHandler, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!enabled) return
    const wrapped: ScanHandler = (event) => ref.current(event)
    const store = useScanEngineStore.getState()
    store.handlers.add(wrapped)
    return () => {
      useScanEngineStore.getState().handlers.delete(wrapped)
    }
  }, [enabled])
}

/** Only the newest subscriber should act on a scan. */
export function useExclusiveScanSubscription(handler: ScanHandler, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!enabled) return
    const wrapped: ScanHandler = (event) => {
      const handlers = [...useScanEngineStore.getState().handlers]
      if (handlers[handlers.length - 1] !== wrapped) return
      ref.current(event)
    }
    useScanEngineStore.getState().handlers.add(wrapped)
    return () => {
      useScanEngineStore.getState().handlers.delete(wrapped)
    }
  }, [enabled])
}

// A hardware scanner is a keyboard that types impossibly fast and presses
// Enter. These two numbers are the whole discrimination: humans do not sustain
// sub-35ms keystrokes, and a scanned code is never one or two characters.
const MAX_INTERKEY_MS = 35
const MIN_CODE_LENGTH = 4
/** Abandon a partial buffer that stopped mid-burst. */
const BUFFER_TIMEOUT_MS = 200

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  if (tag !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file'].includes(type)
}

/**
 * ScanEngine — global HID keyboard-wedge capture.
 *
 * Mounted once at the root. The hard requirement is that it must NOT hijack
 * real typing: a cashier searching for "milk" or typing a quantity has to keep
 * every keystroke. So capture is decided by SPEED, not by focus alone —
 *
 *   - keys arriving faster than a human can type accumulate into a buffer
 *   - Enter closes the buffer; if the burst was fast and long enough it is a
 *     scan, otherwise the buffer is dropped and the app never sees it
 *   - a slow keystroke resets the buffer immediately, so typing can never
 *     accumulate into a false scan
 *
 * When a text field is focused we still capture, but only if the burst is
 * scanner-fast — and then we swallow the keystrokes so the code doesn't also
 * land in the search box. That combination is what makes "scan while the
 * search field has focus" work, which is how cashiers actually use a till.
 */
export function ScanEngineProvider({ children }: { children: React.ReactNode }) {
  const enabled = useScanEngineStore((s) => s.enabled)

  useEffect(() => {
    if (!enabled) return

    let buffer = ''
    let lastKeyAt = 0
    let startedAt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    // Keys we swallowed, so a completed scan doesn't also type into a field.
    let intercepting = false

    function reset() {
      buffer = ''
      intercepting = false
      clearTimeout(timer)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const now = performance.now()
      const gap = now - lastKeyAt
      lastKeyAt = now

      if (e.key === 'Enter') {
        const fast = buffer.length >= MIN_CODE_LENGTH && now - startedAt < buffer.length * MAX_INTERKEY_MS
        if (fast) {
          const code = buffer
          reset()
          // Swallow the Enter too — it would otherwise submit whatever form
          // the cursor happens to be sitting in.
          e.preventDefault()
          e.stopPropagation()
          useScanEngineStore.getState().emit({ code, source: 'keyboard', at: Date.now() })
          return
        }
        reset()
        return
      }

      // Only printable single characters form a code.
      if (e.key.length !== 1) return

      if (gap > MAX_INTERKEY_MS) {
        // Human-speed keystroke: start a fresh candidate buffer. It only ever
        // becomes a scan if everything after it arrives at machine speed.
        buffer = e.key
        startedAt = now
        intercepting = false
        clearTimeout(timer)
        timer = setTimeout(reset, BUFFER_TIMEOUT_MS)
        return
      }

      buffer += e.key
      clearTimeout(timer)
      timer = setTimeout(reset, BUFFER_TIMEOUT_MS)

      // Past the length threshold at machine speed, this is a scanner. Start
      // swallowing so the tail of the code doesn't appear in a focused input.
      if (!intercepting && buffer.length >= MIN_CODE_LENGTH && isTextEntry(document.activeElement)) {
        intercepting = true
        // Remove what already leaked into the field before we were sure.
        const el = document.activeElement as HTMLInputElement
        if (typeof el.value === 'string' && el.value.endsWith(buffer.slice(0, -1))) {
          const trimmed = el.value.slice(0, el.value.length - (buffer.length - 1))
          el.value = trimmed
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
      if (intercepting) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      clearTimeout(timer)
    }
  }, [enabled])

  return <>{children}</>
}

/** Feed a code in by hand — the manual fallback and the diagnostics page. */
export function emitManualScan(code: string) {
  const trimmed = code.trim()
  if (!trimmed) return
  useScanEngineStore.getState().emit({ code: trimmed, source: 'manual', at: Date.now() })
}

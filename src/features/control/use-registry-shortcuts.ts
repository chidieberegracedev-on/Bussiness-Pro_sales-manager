import { useEffect } from 'react'

export interface RegistryShortcuts {
  onPay?: () => void
  onHold?: () => void
  onResume?: () => void
  onPettyCash?: () => void
  onSafeDrop?: () => void
  onShift?: () => void
  onClear?: () => void
  onEscape?: () => void
}

/**
 * Registry keyboard shortcuts.
 *
 * A till is a keyboard-first surface: the cashier's hands are on a scanner and
 * a number pad, not a mouse. F-keys map to the tools, Enter takes payment.
 *
 * Two rules keep this from fighting the rest of the app:
 *   - nothing fires while a text field has focus, except the F-keys, which no
 *     text field wants anyway
 *   - Enter only pays when the cashier isn't typing, so pressing Enter in the
 *     search box still searches
 *
 * The browser owns F5 and F11; we deliberately don't take them.
 */
export function useRegistryShortcuts(shortcuts: RegistryShortcuts, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    function isTyping(): boolean {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const map: Record<string, (() => void) | undefined> = {
        F1: shortcuts.onHold,
        F2: shortcuts.onResume,
        F3: shortcuts.onPettyCash,
        F4: shortcuts.onSafeDrop,
        F6: shortcuts.onShift,
      }

      const fn = map[e.key]
      if (fn) {
        e.preventDefault()
        fn()
        return
      }

      if (e.key === 'Escape' && shortcuts.onEscape) {
        shortcuts.onEscape()
        return
      }

      if (isTyping()) return

      if (e.key === 'Enter' && shortcuts.onPay) {
        e.preventDefault()
        shortcuts.onPay()
        return
      }
      if (e.key === 'Delete' && shortcuts.onClear) {
        e.preventDefault()
        shortcuts.onClear()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, shortcuts])
}

export const SHORTCUT_HINTS: { key: string; label: string }[] = [
  { key: 'F1', label: 'Hold' },
  { key: 'F2', label: 'Resume' },
  { key: 'F3', label: 'Petty cash' },
  { key: 'F4', label: 'Safe drop' },
  { key: 'F6', label: 'Shift' },
  { key: 'Enter', label: 'Take payment' },
]

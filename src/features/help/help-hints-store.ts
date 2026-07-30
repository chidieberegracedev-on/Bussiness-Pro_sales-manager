import { create } from 'zustand'

const STORAGE_KEY = 'bp-help-hints'

interface HelpHintsState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  toggle: () => void
}

// Hints are ON by default — new users benefit, and experienced users can turn
// every ⓘ off from Settings › Appearance.
function initial(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

export const useHelpHintsStore = create<HelpHintsState>((set) => ({
  enabled: initial(),
  setEnabled: (enabled) => {
    localStorage.setItem(STORAGE_KEY, String(enabled))
    set({ enabled })
  },
  toggle: () =>
    set((s) => {
      const next = !s.enabled
      localStorage.setItem(STORAGE_KEY, String(next))
      return { enabled: next }
    }),
}))

export function useHelpHints(): boolean {
  return useHelpHintsStore((s) => s.enabled)
}

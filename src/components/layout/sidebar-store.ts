import { create } from 'zustand'

const STORAGE_KEY = 'bp-sidebar-collapsed'

interface SidebarState {
  collapsed: boolean
  mobileOpen: boolean
  toggleCollapsed: () => void
  setMobileOpen: (open: boolean) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem(STORAGE_KEY) === 'true',
  mobileOpen: false,
  toggleCollapsed: () =>
    set((s) => {
      const next = !s.collapsed
      localStorage.setItem(STORAGE_KEY, String(next))
      return { collapsed: next }
    }),
  setMobileOpen: (open) => set({ mobileOpen: open }),
}))

import { create } from 'zustand'

const STORAGE_KEY = 'bp-active-business-id'

interface BusinessState {
  activeBusinessId: string | null
  setActiveBusiness: (businessId: string) => void
  clearActiveBusiness: () => void
}

export const useBusinessStore = create<BusinessState>((set) => ({
  activeBusinessId: localStorage.getItem(STORAGE_KEY),
  setActiveBusiness: (businessId) => {
    localStorage.setItem(STORAGE_KEY, businessId)
    set({ activeBusinessId: businessId })
  },
  clearActiveBusiness: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ activeBusinessId: null })
  },
}))

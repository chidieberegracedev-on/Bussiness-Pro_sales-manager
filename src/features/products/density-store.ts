import { create } from 'zustand'

export type Density = 'table' | 'grid'
const STORAGE_KEY = 'bp-product-density'

interface DensityState {
  density: Density
  setDensity: (density: Density) => void
}

export const useDensityStore = create<DensityState>((set) => ({
  density: (localStorage.getItem(STORAGE_KEY) as Density) || 'table',
  setDensity: (density) => {
    localStorage.setItem(STORAGE_KEY, density)
    set({ density })
  },
}))

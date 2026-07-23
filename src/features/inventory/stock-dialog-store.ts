import { create } from 'zustand'

export interface StockDialogVariantOption {
  variantId: string
  label: string
  qtyOnHand: string
  avgCost: string
}

export interface StockDialogContext {
  productId: string
  productName: string
  locationId: string
  baseUnit: string
  purchaseUnit?: string | null
  purchaseConversionQty?: string | null
  variants: StockDialogVariantOption[]
  preselectVariantId?: string
}

interface StockDialogState {
  addStockContext: StockDialogContext | null
  adjustStockContext: StockDialogContext | null
  openAddStock: (context: StockDialogContext) => void
  closeAddStock: () => void
  openAdjustStock: (context: StockDialogContext) => void
  closeAdjustStock: () => void
}

export const useStockDialogStore = create<StockDialogState>((set) => ({
  addStockContext: null,
  adjustStockContext: null,
  openAddStock: (context) => set({ addStockContext: context }),
  closeAddStock: () => set({ addStockContext: null }),
  openAdjustStock: (context) => set({ adjustStockContext: context }),
  closeAdjustStock: () => set({ adjustStockContext: null }),
}))

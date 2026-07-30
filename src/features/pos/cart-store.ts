import { create } from 'zustand'
import Decimal from 'decimal.js'

export interface CartLine {
  variantId: string
  productName: string
  variantName: string | null
  baseUnit: string
  /** Display only — server re-reads the authoritative price at completion (BR-S1.4). */
  unitPrice: Decimal
  quantity: Decimal
  /** Minted when the line is added, kept stable across quantity edits (BR-S5.3). */
  movementId: string
}

interface CartState {
  /** Minted once when the cart is first opened or reset — never at completion time (BR-S5.1). */
  saleId: string
  lines: CartLine[]
  /** Increments on every addLine call, including a merge that doesn't change lines.length — lets the picker refocus its search bar after every add, not just the first per variant. */
  addedCount: number
  addLine: (item: { variantId: string; productName: string; variantName: string | null; baseUnit: string; unitPrice: Decimal }) => void
  removeLine: (variantId: string) => void
  setQuantity: (variantId: string, quantity: Decimal) => void
  /** Replaces the basket wholesale — used when resuming a held basket. */
  setLines: (lines: CartLine[]) => void
  reset: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  saleId: crypto.randomUUID(),
  lines: [],
  addedCount: 0,

  addLine: (item) => {
    const existing = get().lines.find((l) => l.variantId === item.variantId)
    if (existing) {
      // Merge by variantId — quantity accumulates, movementId stays stable (BR-S1.5).
      set({
        lines: get().lines.map((l) =>
          l.variantId === item.variantId ? { ...l, quantity: l.quantity.plus(1) } : l,
        ),
        addedCount: get().addedCount + 1,
      })
      return
    }
    set({
      lines: [
        ...get().lines,
        {
          ...item,
          quantity: new Decimal(1),
          movementId: crypto.randomUUID(),
        },
      ],
      addedCount: get().addedCount + 1,
    })
  },

  removeLine: (variantId) => {
    set({ lines: get().lines.filter((l) => l.variantId !== variantId) })
  },

  setQuantity: (variantId, quantity) => {
    if (quantity.lte(0)) {
      get().removeLine(variantId)
      return
    }
    set({
      lines: get().lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
    })
  },

  // A resumed basket becomes a fresh sale attempt: mint a new saleId so it
  // cannot collide with the idempotency key of the sale it was parked from.
  setLines: (lines) => set({ saleId: crypto.randomUUID(), lines, addedCount: 0 }),

  reset: () => set({ saleId: crypto.randomUUID(), lines: [], addedCount: 0 }),
}))

export function cartSubtotal(lines: CartLine[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(l.quantity.times(l.unitPrice)), new Decimal(0))
}

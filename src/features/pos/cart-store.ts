import { create } from 'zustand'
import Decimal from 'decimal.js'

export interface CartLine {
  variantId: string
  productName: string
  variantName: string | null
  baseUnit: string
  /** Display only — server re-reads the authoritative price at completion (BR-S1.4). */
  unitPrice: Decimal
  /** Storage path for the cart thumbnail. Null for scanned items. */
  imagePath?: string | null
  quantity: Decimal
  /**
   * A PROPOSED amount off this whole line, gated by allow_line_discount. The
   * server bounds it and still sets the price itself — the client never names
   * a price, only asks for money off one. Absent means no discount.
   */
  discount?: Decimal
  /** Minted when the line is added, kept stable across quantity edits (BR-S5.3). */
  movementId: string
}

export interface CartCustomer {
  id: string
  name: string
}

interface CartState {
  /** Minted once when the cart is first opened or reset — never at completion time (BR-S5.1). */
  saleId: string
  lines: CartLine[]
  /** The customer this sale is for, when capture_customer is on. */
  customer: CartCustomer | null
  /** Increments on every addLine call, including a merge that doesn't change lines.length — lets the picker refocus its search bar after every add, not just the first per variant. */
  addedCount: number
  /** `quantity` defaults to 1; a carton barcode passes its units_per_scan (Phase 10). */
  addLine: (item: { variantId: string; productName: string; variantName: string | null; baseUnit: string; unitPrice: Decimal; quantity?: Decimal; imagePath?: string | null }) => void
  removeLine: (variantId: string) => void
  setQuantity: (variantId: string, quantity: Decimal) => void
  /** Set (or clear, with null) the proposed discount on one line. */
  setLineDiscount: (variantId: string, discount: Decimal | null) => void
  setCustomer: (customer: CartCustomer | null) => void
  /** Replaces the basket wholesale — used when resuming a held basket. */
  setLines: (lines: CartLine[]) => void
  reset: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  saleId: crypto.randomUUID(),
  lines: [],
  customer: null,
  addedCount: 0,

  addLine: ({ quantity, ...item }) => {
    // A tap adds one; a carton scan adds the whole carton. The unit context
    // comes from the barcode resolver, so the till never has to know what a
    // carton is — it just adds what it was handed.
    const step = quantity ?? new Decimal(1)
    const existing = get().lines.find((l) => l.variantId === item.variantId)
    if (existing) {
      // Merge by variantId — quantity accumulates, movementId stays stable (BR-S1.5).
      set({
        lines: get().lines.map((l) =>
          l.variantId === item.variantId ? { ...l, quantity: l.quantity.plus(step) } : l,
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
          quantity: step,
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

  setLineDiscount: (variantId, discount) => {
    set({
      lines: get().lines.map((l) =>
        l.variantId === variantId
          ? { ...l, discount: discount && discount.gt(0) ? discount : undefined }
          : l,
      ),
    })
  },

  setCustomer: (customer) => set({ customer }),

  // A resumed basket becomes a fresh sale attempt: mint a new saleId so it
  // cannot collide with the idempotency key of the sale it was parked from.
  setLines: (lines) => set({ saleId: crypto.randomUUID(), lines, customer: null, addedCount: 0 }),

  reset: () => set({ saleId: crypto.randomUUID(), lines: [], customer: null, addedCount: 0 }),
}))

/** Gross of discounts — every line at its list price. */
export function cartSubtotal(lines: CartLine[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(l.quantity.times(l.unitPrice)), new Decimal(0))
}

/**
 * A line's discount, clamped to its own gross so a stale discount left on a
 * line whose quantity was later reduced can never exceed it and drive the line
 * — or the sale — negative. The server clamps too; this keeps the displayed
 * total honest before it gets there.
 */
export function lineDiscount(line: CartLine): Decimal {
  if (!line.discount || line.discount.lte(0)) return new Decimal(0)
  const gross = line.quantity.times(line.unitPrice)
  return Decimal.min(line.discount, gross)
}

export function cartDiscountTotal(lines: CartLine[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(lineDiscount(l)), new Decimal(0))
}

/** What the customer actually pays: gross minus clamped line discounts. */
export function cartNetTotal(lines: CartLine[]): Decimal {
  return cartSubtotal(lines).minus(cartDiscountTotal(lines))
}

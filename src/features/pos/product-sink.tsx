import { createContext, useContext, useMemo, type ReactNode } from 'react'
import Decimal from 'decimal.js'
import { useCartStore } from '@/features/pos/cart-store'

export interface SinkEntry {
  variantId: string
  productName: string
  variantName: string | null
  baseUnit: string
  unitPrice: Decimal
  imagePath: string | null
}

/**
 * Where a picked product goes.
 *
 * The product browser is the same in every vertical — search, categories,
 * tiles or rows, the in-tile stepper — but what a pick MEANS is not. On a
 * retail till it appends to the local cart. In a restaurant it appends to a
 * server-persisted order that belongs to a table, that another server may also
 * be touching, and that survives a page reload.
 *
 * Forking the product browser for that difference would duplicate the one
 * screen every cashier spends their day on, so the destination is a plug
 * instead: one browser, one set of tiles, one stepper, two sinks.
 */
export interface ProductSink {
  /** Quantity of one variant currently in the destination. */
  quantityOf: (variantId: string) => Decimal
  /** Add one of this variant (or increment, if the sink merges lines). */
  add: (entry: SinkEntry) => void
  /** Set an absolute quantity. Zero or less removes the line. */
  setQuantity: (variantId: string, quantity: Decimal) => void
}

const ProductSinkContext = createContext<ProductSink | null>(null)

export function ProductSinkProvider({
  sink,
  children,
}: {
  sink: ProductSink
  children: ReactNode
}) {
  return <ProductSinkContext.Provider value={sink}>{children}</ProductSinkContext.Provider>
}

/**
 * The active sink, defaulting to the cart.
 *
 * Both the context read and the cart subscription always run — the fallback
 * cannot be conditional without breaking the rules of hooks, and a cart
 * subscription nothing renders costs nothing.
 */
export function useProductSink(): ProductSink {
  const override = useContext(ProductSinkContext)
  const addLine = useCartStore((s) => s.addLine)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const lines = useCartStore((s) => s.lines)

  const cartSink = useMemo<ProductSink>(
    () => ({
      quantityOf: (variantId) =>
        lines.find((l) => l.variantId === variantId)?.quantity ?? new Decimal(0),
      add: (entry) => addLine(entry),
      setQuantity: (variantId, quantity) => setQuantity(variantId, quantity),
    }),
    [lines, addLine, setQuantity],
  )

  return override ?? cartSink
}

import Decimal from 'decimal.js'
import { Minus, Plus, Trash2, ShoppingCart } from 'lucide-react'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { EmptyState } from '@/components/data/empty-state'

export function CartPanel({ onTakePayment }: { onTakePayment: () => void }) {
  const lines = useCartStore((s) => s.lines)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const removeLine = useCartStore((s) => s.removeLine)
  const subtotal = cartSubtotal(lines)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Cart is empty"
            description="Search for a product to add it here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.variantId} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{line.productName}</p>
                  {line.variantName && <p className="text-xs text-text-muted">{line.variantName}</p>}
                  <p className="mt-0.5 text-sm text-text-secondary">
                    <Money value={line.unitPrice} /> each
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setQuantity(line.variantId, line.quantity.minus(1))}
                      aria-label={`Decrease quantity of ${line.productName}`}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={line.quantity.toString()}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                          try {
                            setQuantity(line.variantId, new Decimal(raw || 0))
                          } catch {
                            // ignore incomplete decimal input (e.g. trailing ".")
                          }
                        }
                      }}
                      className="h-8 w-16 text-center"
                      aria-label={`Quantity of ${line.productName}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setQuantity(line.variantId, line.quantity.plus(1))}
                      aria-label={`Increase quantity of ${line.productName}`}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      <Money value={line.quantity.times(line.unitPrice)} />
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => removeLine(line.variantId)}
                      aria-label={`Remove ${line.productName} from cart`}
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <div className="shrink-0 space-y-3 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>
              Subtotal (<Quantity value={lines.length} /> item{lines.length === 1 ? '' : 's'})
            </span>
            <Money value={subtotal} />
          </div>
          <div className="flex items-center justify-between text-lg font-semibold text-text-primary">
            <span>Total</span>
            <Money value={subtotal} />
          </div>
          <Button className="w-full" size="lg" onClick={onTakePayment}>
            Take payment
          </Button>
        </div>
      )}
    </div>
  )
}
